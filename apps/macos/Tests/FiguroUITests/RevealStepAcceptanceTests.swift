import XCTest

@MainActor
final class RevealStepAcceptanceTests: XCTestCase {
    private var app: XCUIApplication!
    private var documentURL: URL!

    private func makeApplication() -> XCUIApplication {
        let application = XCUIApplication()
        application.launchEnvironment["FIGURO_SKIP_DEFAULT_APP_REQUEST"] = "1"
        return application
    }

    // Async lifecycle hooks can share this suite's main-actor isolation.
    @MainActor
    override func setUp() async throws {
        continueAfterFailure = false
        try copyFixture(named: "reveal-step")
    }

    private func copyFixture(named name: String) throws {
        let bundle = Bundle(for: Self.self)
        let fixture = try XCTUnwrap(
            bundle.url(forResource: name, withExtension: "excalidraw"),
            "Missing bundled fixture \(name).excalidraw in \(bundle.bundlePath)")
        documentURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("excalidraw")
        try FileManager.default.copyItem(at: fixture, to: documentURL)
    }

    @MainActor
    override func tearDown() async throws {
        if let app, (testRun?.failureCount ?? 0) > 0 {
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = "Figuro accessibility hierarchy at failure"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)

            let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            screenshot.name = "Desktop at failure"
            screenshot.lifetime = .keepAlways
            add(screenshot)
        }
        app?.terminate()
        if let documentURL {
            try? FileManager.default.removeItem(at: documentURL)
        }
    }

    func testUnknownMetadataVersionRemainsOpaque() throws {
        try FileManager.default.removeItem(at: documentURL)
        try copyFixture(named: "unsupported-version")
        let originalContents = try Data(contentsOf: documentURL)

        app = makeApplication()
        app.launch()
        openDocument()
        selectOnlyElement()

        let warning = editor.staticTexts.matching(
            NSPredicate(
                format: "value CONTAINS %@ OR label CONTAINS %@",
                "unsupported presentation metadata version", "unsupported presentation metadata version")
        ).firstMatch
        XCTAssertTrue(warning.waitForExistence(timeout: 5))
        XCTAssertFalse(revealStepField.isEnabled)
        XCTAssertFalse(editor.buttons["Clear step"].isEnabled)
        XCTAssertFalse(editor.buttons["Clear role"].isEnabled)
        XCTAssertFalse(semanticStyleRoleField.isEnabled)

        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
        moveSelectedElement()
        saveDocument()
        XCTAssertTrue(waitForElementXToChange(from: 100))
        assertUnsupportedMetadataRemainsUnchanged()
    }

    func testSelectedElementRevealStepSurvivesSaveAndReopenAndCanBeCleared() throws {
        let originalContents = try Data(contentsOf: documentURL)
        app = makeApplication()
        app.launch()
        openDocument()
        selectOnlyElement()
        XCTAssertTrue(editor.staticTexts["Current: No step · visible initially"].exists)
        switchToolsAndPan()
        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
        // Switching to the hand tool clears Excalidraw's selection.
        selectOnlyElement()

        let stepField = revealStepField
        XCTAssertTrue(stepField.waitForExistence(timeout: 10))

        replaceRevealStep(with: "-1")
        XCTAssertTrue(editor.staticTexts["Enter a whole number of 0 or greater."].exists)
        replaceRevealStep(with: "1.5")
        XCTAssertTrue(editor.staticTexts["Enter a whole number of 0 or greater."].exists)
        replaceRevealStep(with: "0")
        XCTAssertFalse(editor.staticTexts["Enter a whole number of 0 or greater."].exists)

        saveDocument()
        XCTAssertTrue(waitForSavedStep(0))
        XCTAssertTrue(editor.staticTexts["Current: Step 0"].exists)
        XCTAssertTrue(
            editor.staticTexts["Step 0 and elements without a step are visible initially."].exists)

        replaceRevealStep(with: "3")

        saveDocument()
        XCTAssertTrue(waitForSavedStep(3))
        assertUnrelatedAndUnknownMetadataArePreserved(step: 3)

        app.typeKey("w", modifierFlags: .command)
        openDocument()
        selectOnlyElement()
        XCTAssertEqual(revealStepField.value as? String, "3")

        editor.buttons["Clear step"].click()
        saveDocument()
        XCTAssertTrue(waitForSavedStep(nil))
        assertUnrelatedAndUnknownMetadataArePreserved(step: nil)
    }

    func testSemanticStyleRoleSurvivesSaveAndReopenAndCanBeClearedIndependently() throws {
        app = makeApplication()
        app.launch()
        openDocument()
        selectOnlyElement()

        replaceRevealStep(with: "3")
        saveDocument()
        XCTAssertTrue(waitForSavedStep(3))
        let originalAppearance = try XCTUnwrap(savedElementAppearance)

        XCTAssertTrue(semanticStyleRoleField.waitForExistence(timeout: 5))
        XCTAssertTrue(editor.staticTexts["Current: No role"].exists)
        XCTAssertFalse(editor.buttons["Clear role"].isEnabled)
        replaceSemanticStyleRole(with: "primary")
        XCTAssertEqual(semanticStyleRoleField.value as? String, "primary")
        XCTAssertTrue(editor.staticTexts["Current: Role primary"].exists)
        saveDocument()
        XCTAssertTrue(waitForSavedRole("primary"))
        assertUnrelatedAndUnknownMetadataArePreserved(step: 3)
        XCTAssertEqual(savedElementAppearance, originalAppearance)

        app.typeKey("w", modifierFlags: .command)
        openDocument()
        selectOnlyElement()
        XCTAssertEqual(semanticStyleRoleField.value as? String, "primary")
        XCTAssertTrue(editor.staticTexts["Current: Role primary"].exists)

        replaceSemanticStyleRole(with: "supporting")
        saveDocument()
        XCTAssertTrue(waitForSavedRole("supporting"))
        assertUnrelatedAndUnknownMetadataArePreserved(step: 3)
        XCTAssertEqual(savedElementAppearance, originalAppearance)

        // Step and role edits must preserve each other in both directions.
        editor.buttons["Clear step"].click()
        saveDocument()
        XCTAssertTrue(waitForSavedStep(nil))
        XCTAssertEqual(savedElementMetadata?.figuro["role"] as? String, "supporting")
        replaceRevealStep(with: "3")
        saveDocument()
        XCTAssertTrue(waitForSavedStep(3))
        XCTAssertEqual(savedElementMetadata?.figuro["role"] as? String, "supporting")

        editor.buttons["Clear role"].click()
        saveDocument()
        XCTAssertTrue(waitForSavedRole(nil))
        assertUnrelatedAndUnknownMetadataArePreserved(step: 3)
        XCTAssertEqual(savedElementAppearance, originalAppearance)

        app.typeKey("w", modifierFlags: .command)
        openDocument()
        selectOnlyElement()
        XCTAssertEqual(semanticStyleRoleField.value as? String, "")
        XCTAssertTrue(editor.staticTexts["Current: No role"].exists)
        XCTAssertFalse(editor.buttons["Clear role"].isEnabled)
        XCTAssertEqual(revealStepField.value as? String, "3")
    }

    func testRoleOnlyMetadataCanBeAssignedAndRemovedWithoutChangingDrawing() throws {
        var document = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: documentURL)) as? [String: Any])
        var elements = try XCTUnwrap(document["elements"] as? [[String: Any]])
        // Start with an ordinary element whose customData belongs to another tool.
        elements[0]["customData"] = ["owner": "acceptance-fixture"]
        document["elements"] = elements
        try JSONSerialization.data(withJSONObject: document).write(to: documentURL)
        let originalContents = try Data(contentsOf: documentURL)

        app = makeApplication()
        app.launch()
        openDocument()
        selectOnlyElement()
        XCTAssertTrue(editor.staticTexts["Current: No role"].exists)
        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
        replaceSemanticStyleRole(with: "primary")
        saveDocument()
        XCTAssertTrue(waitForSavedRole("primary"))
        let originalAppearance = try XCTUnwrap(savedElementAppearance)
        XCTAssertEqual(savedElementMetadata?.figuro["v"] as? Int, 1)
        XCTAssertNil(savedElementMetadata?.figuro["step"])

        // Focusing a field without editing is a view-only action.
        let assignedContents = try Data(contentsOf: documentURL)
        semanticStyleRoleField.click()
        revealStepField.click()
        saveDocument()
        XCTAssertTrue(staysUnchangedForAutosaveWindow(assignedContents))

        editor.buttons["Clear role"].click()
        saveDocument()
        XCTAssertTrue(waitForSavedRole(nil))
        XCTAssertEqual(savedElement?["customData"] as? [String: String], ["owner": "acceptance-fixture"])
        XCTAssertEqual(savedElementAppearance, originalAppearance)

        app.typeKey("w", modifierFlags: .command)
        openDocument()
        selectOnlyElement()
        XCTAssertTrue(editor.staticTexts["Current: No role"].exists)
        XCTAssertEqual(semanticStyleRoleField.value as? String, "")
        XCTAssertFalse(editor.buttons["Clear role"].isEnabled)
    }

    func testMixedSelectionShowsDifferentStepsAndRolesIncludingArrows() throws {
        try FileManager.default.removeItem(at: documentURL)
        try copyFixture(named: "mixed-selection")
        let originalContents = try Data(contentsOf: documentURL)

        app = makeApplication()
        app.launch()
        openDocument()
        selectAllElements()

        XCTAssertTrue(editor.staticTexts["3 selected"].exists)
        XCTAssertTrue(editor.staticTexts["Current: Mixed steps"].exists)
        XCTAssertTrue(editor.staticTexts["Current: Mixed roles"].exists)
        XCTAssertEqual(revealStepField.value as? String, "")
        XCTAssertEqual(semanticStyleRoleField.value as? String, "")
        XCTAssertTrue(revealStepField.isEnabled)
        XCTAssertTrue(semanticStyleRoleField.isEnabled)
        XCTAssertTrue(editor.buttons["Clear step"].isEnabled)
        XCTAssertTrue(editor.buttons["Clear role"].isEnabled)
        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
    }

    func testMultiSelectionEditsAndIndependentClearsSurviveSaveAndReopen() throws {
        try FileManager.default.removeItem(at: documentURL)
        try copyFixture(named: "mixed-selection")
        let originalElements = try XCTUnwrap(savedElements)
        app = makeApplication()
        app.launch()
        openDocument()
        selectAllElements()

        replaceRevealStep(with: "3")
        saveDocument()
        XCTAssertTrue(waitForSavedElements { elements in
            elements.allSatisfy { self.metadata(of: $0)?["step"] as? Int == 3 }
        })
        assertSelectionDataPreserved(from: originalElements, preserving: ["role", "futureField"])
        XCTAssertTrue(editor.staticTexts["Current: Step 3"].exists)
        XCTAssertTrue(editor.staticTexts["Current: Mixed roles"].exists)

        replaceSemanticStyleRole(with: "shared")
        saveDocument()
        XCTAssertTrue(waitForSelectionMetadata(step: 3, role: "shared"))
        assertSelectionDataPreserved(from: originalElements, preserving: ["futureField"])

        let assignedContents = try Data(contentsOf: documentURL)
        revealStepField.click()
        semanticStyleRoleField.click()
        saveDocument()
        XCTAssertTrue(staysUnchangedForAutosaveWindow(assignedContents))

        app.typeKey("w", modifierFlags: .command)
        openDocument()
        selectAllElements()
        XCTAssertEqual(revealStepField.value as? String, "3")
        XCTAssertEqual(semanticStyleRoleField.value as? String, "shared")
        editor.buttons["Clear step"].click()
        saveDocument()
        XCTAssertTrue(waitForSelectionMetadata(step: nil, role: "shared"))
        XCTAssertTrue(editor.staticTexts["Current: No step · visible initially"].exists)
        XCTAssertFalse(editor.buttons["Clear step"].isEnabled)

        replaceRevealStep(with: "5")
        editor.buttons["Clear role"].click()
        saveDocument()
        XCTAssertTrue(waitForSelectionMetadata(step: 5, role: nil))
        assertSelectionDataPreserved(from: originalElements, preserving: ["futureField"])
        XCTAssertFalse(editor.buttons["Clear role"].isEnabled)

        app.typeKey("w", modifierFlags: .command)
        openDocument()
        selectAllElements()
        XCTAssertEqual(revealStepField.value as? String, "5")
        XCTAssertEqual(semanticStyleRoleField.value as? String, "")
    }

    func testClearingAllFiguroMetadataPreservesOtherElementData() throws {
        try FileManager.default.removeItem(at: documentURL)
        try copyFixture(named: "mixed-selection")
        let originalElements = try XCTUnwrap(savedElements)
        app = makeApplication()
        app.launch()
        openDocument()
        selectAllElements()

        let clearAll = editor.buttons["Clear presentation metadata"]
        XCTAssertTrue(clearAll.waitForExistence(timeout: 5))
        XCTAssertTrue(clearAll.isEnabled)
        clearAll.click()
        saveDocument()
        XCTAssertTrue(waitForSavedElements { elements in
            elements.allSatisfy { ($0["customData"] as? [String: Any])?["figuro"] == nil }
        })
        assertSelectionDataPreserved(from: originalElements, preserving: [])
        XCTAssertFalse(clearAll.isEnabled)
        XCTAssertFalse(editor.buttons["Clear step"].isEnabled)
        XCTAssertFalse(editor.buttons["Clear role"].isEnabled)

        let clearedContents = try Data(contentsOf: documentURL)
        app.typeKey("w", modifierFlags: .command)
        openDocument()
        selectAllElements()
        XCTAssertTrue(editor.staticTexts["Current: No step · visible initially"].exists)
        XCTAssertTrue(editor.staticTexts["Current: No role"].exists)
        XCTAssertFalse(clearAll.isEnabled)
        XCTAssertTrue(staysUnchangedForAutosaveWindow(clearedContents))
    }

    func testArrowCanBeEditedAloneWithoutChangingOtherElements() throws {
        try FileManager.default.removeItem(at: documentURL)
        try copyFixture(named: "mixed-selection")
        let originals = try XCTUnwrap(savedElements)
        app = makeApplication()
        app.launch()
        openDocument()
        // The arrow crosses the fitted scene's center, between the two shapes.
        focusCanvasCenter()
        XCTAssertTrue(editor.staticTexts["1 selected"].waitForExistence(timeout: 5))
        XCTAssertEqual(revealStepField.value as? String, "4")
        XCTAssertEqual(semanticStyleRoleField.value as? String, "supporting")
        replaceRevealStep(with: "8")
        replaceSemanticStyleRole(with: "connection")
        saveDocument()
        XCTAssertTrue(waitForSavedElements { elements in
            guard let arrow = elements.first(where: { $0["id"] as? String == "mixed-arrow" }) else { return false }
            return self.metadata(of: arrow)?["step"] as? Int == 8 && self.metadata(of: arrow)?["role"] as? String == "connection"
        })
        assertSelectionDataPreserved(from: originals, preserving: ["futureField"])
        for original in originals where original["id"] as? String != "mixed-arrow" {
            let saved = savedElements?.first(where: { $0["id"] as? String == original["id"] as? String })
            XCTAssertEqual(saved.map { $0 as NSDictionary }, original as NSDictionary)
        }

        app.typeKey("w", modifierFlags: .command)
        openDocument()
        focusCanvasCenter()
        XCTAssertTrue(editor.staticTexts["1 selected"].waitForExistence(timeout: 5))
        XCTAssertEqual(revealStepField.value as? String, "8")
        XCTAssertEqual(semanticStyleRoleField.value as? String, "connection")
        editor.buttons["Clear presentation metadata"].click()
        saveDocument()
        XCTAssertTrue(waitForSavedElements { elements in
            guard let arrow = elements.first(where: { $0["id"] as? String == "mixed-arrow" }) else { return false }
            return (arrow["customData"] as? [String: Any])?["figuro"] == nil
        })
        assertSelectionDataPreserved(from: originals, preserving: [])
    }

    func testSelectionContainingOpaqueMetadataKeepsAllMetadataUnchanged() throws {
        try FileManager.default.removeItem(at: documentURL)
        try copyFixture(named: "mixed-selection")
        var document = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: documentURL)) as? [String: Any])
        var elements = try XCTUnwrap(document["elements"] as? [[String: Any]])
        elements[1]["customData"] = ["owner": "arrow-owner", "figuro": ["v": 2, "step": 4, "role": "future-role", "futureField": ["keep": true]]]
        document["elements"] = elements
        try JSONSerialization.data(withJSONObject: document).write(to: documentURL)
        let originalContents = try Data(contentsOf: documentURL)
        app = makeApplication()
        app.launch()
        openDocument()
        selectAllElements()
        XCTAssertTrue(editor.staticTexts["Current: Mixed steps"].exists)
        XCTAssertTrue(editor.staticTexts["Current: Mixed roles"].exists)
        XCTAssertFalse(revealStepField.isEnabled)
        XCTAssertFalse(semanticStyleRoleField.isEnabled)
        for name in ["Clear step", "Clear role", "Clear presentation metadata"] {
            XCTAssertFalse(editor.buttons[name].isEnabled)
        }
        saveDocument()
        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
        moveSelectedElement()
        saveDocument()
        XCTAssertTrue(waitForSavedElements { saved in
            saved.allSatisfy { element in
                guard let original = elements.first(where: { $0["id"] as? String == element["id"] as? String }) else { return false }
                return element["x"] as? Double != original["x"] as? Double
            }
        })
        for original in elements {
            let saved = savedElements?.first(where: { $0["id"] as? String == original["id"] as? String })
            XCTAssertEqual(saved?["customData"] as? NSDictionary, original["customData"] as? NSDictionary)
        }
    }

    func testPresentationSidebarCanBeHiddenAndToggledWithCommandBWithoutEditingDocument() throws {
        let originalContents = try Data(contentsOf: documentURL)
        app = makeApplication()
        app.launch()
        openDocument()
        selectOnlyElement()

        let toggle = editor.buttons["Toggle presentation sidebar"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        // The editor's standard sidebar close control is available as well.
        editor.buttons["Close"].click()
        XCTAssertFalse(revealStepField.exists)
        toggle.click()
        XCTAssertTrue(revealStepField.waitForExistence(timeout: 5))

        // The shortcut also works while an inspector field has focus.
        revealStepField.click()
        app.typeKey("b", modifierFlags: .command)
        XCTAssertFalse(revealStepField.exists)
        app.typeKey("b", modifierFlags: .command)
        XCTAssertTrue(revealStepField.waitForExistence(timeout: 5))
        XCTAssertTrue(editor.staticTexts["1 selected"].exists)
        XCTAssertFalse(editor.buttons["Set step"].exists)
        XCTAssertFalse(editor.buttons["Set role"].exists)
        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
    }

    func testEmptyFieldsClearPresentationMetadataImmediately() throws {
        app = makeApplication()
        app.launch()
        openDocument()
        selectOnlyElement()
        replaceRevealStep(with: "3")
        replaceSemanticStyleRole(with: "primary")
        saveDocument()
        XCTAssertTrue(waitForSavedRole("primary"))
        XCTAssertTrue(waitForSavedStep(3))

        revealStepField.click()
        revealStepField.typeKey("a", modifierFlags: .command)
        revealStepField.typeKey(XCUIKeyboardKey.delete.rawValue, modifierFlags: [])
        saveDocument()
        XCTAssertTrue(waitForSavedStep(nil))
        XCTAssertEqual(savedElementMetadata?.figuro["role"] as? String, "primary")

        semanticStyleRoleField.click()
        semanticStyleRoleField.typeKey("a", modifierFlags: .command)
        semanticStyleRoleField.typeKey(XCUIKeyboardKey.delete.rawValue, modifierFlags: [])
        saveDocument()
        XCTAssertTrue(waitForSavedRole(nil))
        assertUnrelatedAndUnknownMetadataArePreserved(step: nil)
    }

    private func metadata(of element: [String: Any]) -> [String: Any]? {
        (element["customData"] as? [String: Any])?["figuro"] as? [String: Any]
    }

    private var savedElements: [[String: Any]]? {
        guard let data = try? Data(contentsOf: documentURL),
              let document = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return document["elements"] as? [[String: Any]]
    }

    private func waitForSavedElements(_ matches: ([[String: Any]]) -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(10)
        repeat {
            if let elements = savedElements, elements.count == 3, matches(elements) { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while Date() < deadline
        return false
    }

    private func waitForSelectionMetadata(step: Int?, role: String?) -> Bool {
        waitForSavedElements { elements in
            elements.allSatisfy {
                let metadata = self.metadata(of: $0)
                return metadata?["step"] as? Int == step && metadata?["role"] as? String == role
            }
        }
    }

    private func assertSelectionDataPreserved(
        from originals: [[String: Any]], preserving metadataFields: [String],
        file: StaticString = #filePath, line: UInt = #line
    ) {
        guard let saved = savedElements else {
            XCTFail("Missing saved elements", file: file, line: line)
            return
        }
        XCTAssertEqual(saved.count, originals.count, file: file, line: line)
        for original in originals {
            guard let element = saved.first(where: { $0["id"] as? String == original["id"] as? String })
            else {
                XCTFail("Missing original element", file: file, line: line)
                continue
            }
            for (key, value) in original where !["customData", "version", "versionNonce", "updated"].contains(key) {
                XCTAssertEqual(element[key] as? NSObject, value as? NSObject, "Changed \(key)", file: file, line: line)
            }
            var originalCustomData = original["customData"] as? [String: Any] ?? [:]
            var savedCustomData = element["customData"] as? [String: Any] ?? [:]
            originalCustomData.removeValue(forKey: "figuro")
            savedCustomData.removeValue(forKey: "figuro")
            XCTAssertEqual(savedCustomData as NSDictionary, originalCustomData as NSDictionary, file: file, line: line)
            for field in metadataFields {
                XCTAssertEqual(metadata(of: element)?[field] as? NSObject, metadata(of: original)?[field] as? NSObject,
                               "Changed metadata \(field)", file: file, line: line)
            }
        }
    }

    private var semanticStyleRoleField: XCUIElement {
        editor.textFields["Semantic style role"]
    }

    private var revealStepField: XCUIElement {
        editor.textFields["Reveal step"]
    }

    private var editor: XCUIElement {
        documentWindow.webViews.firstMatch
    }

    private var documentWindow: XCUIElement {
        app.windows[documentURL.lastPathComponent]
    }

    private func openDocument() {
        app.menuBars.menuBarItems["File"].click()
        app.menuItems["Open…"].click()

        // Scope to the native panel so a same-named Touch Bar button cannot match.
        let openPanel = app.windows["open-panel"]
        XCTAssertTrue(openPanel.waitForExistence(timeout: 5), "File → Open did not show an open panel")
        let openButton = openPanel.buttons["OKButton"]
        XCTAssertTrue(openButton.waitForExistence(timeout: 5), "File → Open did not show an open panel")
        app.typeKey("g", modifierFlags: [.command, .shift])

        let goToSheet = app.sheets["GoToWindow"]
        XCTAssertTrue(goToSheet.waitForExistence(timeout: 5))
        let pathField = goToSheet.textFields["PathTextField"]
        XCTAssertTrue(pathField.waitForExistence(timeout: 5))
        pathField.click()
        pathField.typeKey("a", modifierFlags: .command)
        pathField.typeText(documentURL.path)
        // Current macOS submits the path with Return; there is no Go button.
        pathField.typeKey(XCUIKeyboardKey.return.rawValue, modifierFlags: [])
        let sheetDismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: goToSheet)
        XCTAssertEqual(
            XCTWaiter.wait(for: [sheetDismissed], timeout: 5), .completed,
            "Go to Folder did not accept the fixture path")
        openButton.click()
        XCTAssertTrue(
            editor.waitForExistence(timeout: 10),
            "Opened fixture window was not found: \(documentURL.lastPathComponent)")
        XCTAssertTrue(editor.buttons["Toggle presentation sidebar"].waitForExistence(timeout: 10))
    }

    private func selectOnlyElement() {
        selectAllElements()
    }

    private func selectAllElements() {
        focusCanvasCenter()
        // Select All is independent of the zoom
        // and pan applied while the document window settles or joins a tab group.
        app.typeKey("a", modifierFlags: .command)
        XCTAssertTrue(revealStepField.waitForExistence(timeout: 5))
    }

    private func focusCanvasCenter() {
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        let inspectorWidth = 294.0
        let canvasCenter = (editor.frame.width - inspectorWidth) / 2
        editor.coordinate(
            withNormalizedOffset: CGVector(dx: canvasCenter / editor.frame.width, dy: 0.5)
        ).click()
    }

    private func switchToolsAndPan() {
        editor.typeKey("h", modifierFlags: [])

        let start = editor.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.8))
        let end = editor.coordinate(withNormalizedOffset: CGVector(dx: 0.69, dy: 0.8))
        start.press(forDuration: 0.1, thenDragTo: end)

        editor.typeKey("v", modifierFlags: [])
    }

    private func moveSelectedElement() {
        app.typeKey(XCUIKeyboardKey.rightArrow.rawValue, modifierFlags: [])
    }

    private func replaceRevealStep(with value: String) {
        replaceText(in: revealStepField, with: value)
    }

    private func replaceSemanticStyleRole(with value: String) {
        replaceText(in: semanticStyleRoleField, with: value)
    }

    private func replaceText(in field: XCUIElement, with value: String) {
        field.click()
        field.typeKey("a", modifierFlags: .command)
        field.typeText(value)
    }

    private func saveDocument() {
        app.typeKey("s", modifierFlags: .command)
    }

    private func waitForSavedStep(_ expectedStep: Int?) -> Bool {
        let deadline = Date().addingTimeInterval(10)
        repeat {
            if hasSavedStep(expectedStep) { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while Date() < deadline
        return hasSavedStep(expectedStep)
    }

    private func hasSavedStep(_ expectedStep: Int?) -> Bool {
        guard let metadata = savedElementMetadata?.figuro else { return false }
        if let expectedStep {
            return metadata["step"] as? Int == expectedStep
        }
        return metadata["step"] == nil
    }

    private func waitForSavedRole(_ expectedRole: String?) -> Bool {
        let deadline = Date().addingTimeInterval(10)
        repeat {
            if let element = savedElement {
                let customData = element["customData"] as? [String: Any]
                let metadata = customData?["figuro"] as? [String: Any]
                if let expectedRole, metadata?["role"] as? String == expectedRole { return true }
                if expectedRole == nil && metadata?["role"] == nil { return true }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while Date() < deadline
        return false
    }

    private var savedElement: [String: Any]? {
        guard
            let data = try? Data(contentsOf: documentURL),
            let document = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let elements = document["elements"] as? [[String: Any]],
            let element = elements.first(where: { $0["id"] as? String == "acceptance-target" })
        else {
            return nil
        }
        return element
    }

    private var savedElementAppearance: NSDictionary? {
        guard var element = savedElement else { return nil }
        for field in ["customData", "version", "versionNonce", "updated"] {
            element.removeValue(forKey: field)
        }
        return element as NSDictionary
    }

    private func staysUnchangedForAutosaveWindow(_ expectedContents: Data) -> Bool {
        let deadline = Date().addingTimeInterval(6)
        while Date() < deadline {
            guard (try? Data(contentsOf: documentURL)) == expectedContents else { return false }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return (try? Data(contentsOf: documentURL)) == expectedContents
    }

    private func waitForElementXToChange(from originalX: Double) -> Bool {
        let deadline = Date().addingTimeInterval(10)
        repeat {
            if let savedElementX, savedElementX != originalX { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while Date() < deadline
        guard let savedElementX else { return false }
        return savedElementX != originalX
    }

    private var savedElementX: Double? {
        savedElement?["x"] as? Double
    }

    private func assertUnsupportedMetadataRemainsUnchanged() {
        guard let saved = savedElementMetadata else {
            XCTFail("The saved element or its Figuro metadata is missing")
            return
        }

        XCTAssertEqual(saved.customData["owner"] as? String, "acceptance-fixture")
        XCTAssertEqual(saved.figuro["v"] as? Int, 2)
        XCTAssertEqual(saved.figuro["step"] as? Int, 4)
        XCTAssertEqual(saved.figuro["futureField"] as? [String: Bool], ["keep": true])
    }

    private var savedElementMetadata: (customData: [String: Any], figuro: [String: Any])? {
        guard
            let customData = savedElement?["customData"] as? [String: Any],
            let metadata = customData["figuro"] as? [String: Any]
        else {
            return nil
        }
        return (customData, metadata)
    }

    private func assertUnrelatedAndUnknownMetadataArePreserved(step: Int?) {
        guard let saved = savedElementMetadata else {
            XCTFail("The saved element or its Figuro metadata is missing")
            return
        }

        XCTAssertEqual(saved.customData["owner"] as? String, "acceptance-fixture")
        XCTAssertEqual(saved.figuro["v"] as? Int, 1)
        XCTAssertEqual(saved.figuro["futureField"] as? [String: Bool], ["keep": true])
        if let step {
            XCTAssertEqual(saved.figuro["step"] as? Int, step)
        } else {
            XCTAssertNil(saved.figuro["step"])
        }
    }
}
