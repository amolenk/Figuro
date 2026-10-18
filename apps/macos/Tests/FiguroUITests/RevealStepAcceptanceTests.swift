import XCTest

@MainActor
final class RevealStepAcceptanceTests: XCTestCase {
    private var app: XCUIApplication!
    private var documentURL: URL!

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

        app = XCUIApplication()
        app.launch()
        openDocument()
        selectOnlyElement()

        let warning = editor.staticTexts.matching(
            NSPredicate(
                format: "value CONTAINS %@ OR label CONTAINS %@",
                "unsupported Figuro metadata version", "unsupported Figuro metadata version")
        ).firstMatch
        XCTAssertTrue(warning.waitForExistence(timeout: 5))
        XCTAssertFalse(editor.buttons["Set step"].isEnabled)
        XCTAssertFalse(editor.buttons["Clear step"].isEnabled)
        XCTAssertFalse(editor.buttons["Set role"].isEnabled)
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
        app = XCUIApplication()
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
        XCTAssertFalse(editor.buttons["Set step"].isEnabled)
        replaceRevealStep(with: "1.5")
        XCTAssertFalse(editor.buttons["Set step"].isEnabled)
        replaceRevealStep(with: "0")
        XCTAssertTrue(editor.buttons["Set step"].isEnabled)
        editor.buttons["Set step"].click()

        saveDocument()
        XCTAssertTrue(waitForSavedStep(0))
        XCTAssertTrue(editor.staticTexts["Current: Step 0"].exists)
        XCTAssertTrue(
            editor.staticTexts["Step 0 and elements without a step are visible initially."].exists)

        replaceRevealStep(with: "3")
        editor.buttons["Set step"].click()

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
        app = XCUIApplication()
        app.launch()
        openDocument()
        selectOnlyElement()

        replaceRevealStep(with: "3")
        editor.buttons["Set step"].click()
        saveDocument()
        XCTAssertTrue(waitForSavedStep(3))
        let originalAppearance = try XCTUnwrap(savedElementAppearance)

        XCTAssertTrue(semanticStyleRoleField.waitForExistence(timeout: 5))
        XCTAssertTrue(editor.staticTexts["Current: No role"].exists)
        XCTAssertFalse(editor.buttons["Clear role"].isEnabled)
        replaceSemanticStyleRole(with: "primary")
        XCTAssertEqual(semanticStyleRoleField.value as? String, "primary")
        XCTAssertTrue(editor.buttons["Set role"].isEnabled)
        editor.buttons["Set role"].click()
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
        editor.buttons["Set role"].click()
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
        editor.buttons["Set step"].click()
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
        XCTAssertFalse(editor.buttons["Set role"].isEnabled)
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

        app = XCUIApplication()
        app.launch()
        openDocument()
        selectOnlyElement()
        XCTAssertTrue(editor.staticTexts["Current: No role"].exists)
        XCTAssertFalse(editor.buttons["Set role"].isEnabled)
        replaceSemanticStyleRole(with: "primary")
        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
        editor.buttons["Set role"].click()
        saveDocument()
        XCTAssertTrue(waitForSavedRole("primary"))
        let originalAppearance = try XCTUnwrap(savedElementAppearance)
        XCTAssertEqual(savedElementMetadata?.figuro["v"] as? Int, 1)
        XCTAssertNil(savedElementMetadata?.figuro["step"])

        // Reapplying the same role is a no-op, including Excalidraw's version fields.
        let assignedContents = try Data(contentsOf: documentURL)
        editor.buttons["Set role"].click()
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
        XCTAssertTrue(
            editor.staticTexts["Presentation"].waitForExistence(timeout: 10))
    }

    private func selectOnlyElement() {
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        let inspectorWidth = min(max(editor.frame.width * 0.23, 240), 320)
        let canvasCenter = (editor.frame.width - inspectorWidth) / 2
        editor.coordinate(
            withNormalizedOffset: CGVector(dx: canvasCenter / editor.frame.width, dy: 0.5)
        ).click()
        // The fixture has one element. Select All is independent of the zoom
        // and pan applied while the document window settles or joins a tab group.
        app.typeKey("a", modifierFlags: .command)
        XCTAssertTrue(editor.buttons["Set step"].waitForExistence(timeout: 5))
    }

    private func switchToolsAndPan() {
        editor.typeKey("h", modifierFlags: [])

        let start = editor.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.8))
        let end = editor.coordinate(withNormalizedOffset: CGVector(dx: 0.74, dy: 0.8))
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
