import XCTest

@MainActor
final class RevealStepAcceptanceTests: XCTestCase {
    private var app: XCUIApplication!
    private var documentURL: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        try copyFixture(named: "reveal-step")
    }

    private func copyFixture(named name: String) throws {
        let fixture = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: name, withExtension: "excalidraw"))
        documentURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("excalidraw")
        try FileManager.default.copyItem(at: fixture, to: documentURL)
    }

    override func tearDownWithError() throws {
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
            NSPredicate(format: "label CONTAINS %@", "unsupported Figuro metadata version")
        ).firstMatch
        XCTAssertTrue(warning.waitForExistence(timeout: 5))
        XCTAssertFalse(editor.buttons["Set step"].isEnabled)
        XCTAssertFalse(editor.buttons["Clear step"].isEnabled)

        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))
        saveDocument()
        XCTAssertEqual(try Data(contentsOf: documentURL), originalContents)
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

    private var revealStepField: XCUIElement {
        editor.textFields["Reveal step"]
    }

    private var editor: XCUIElement {
        documentWindow.webViews.firstMatch
    }

    private var documentWindow: XCUIElement {
        let fileName = documentURL.deletingPathExtension().lastPathComponent
        return app.windows.matching(NSPredicate(format: "label CONTAINS %@", fileName)).firstMatch
    }

    private func openDocument() {
        app.menuBars.menuBarItems["File"].click()
        app.menuItems["Open…"].click()

        let openPanel = app.dialogs.firstMatch
        XCTAssertTrue(openPanel.waitForExistence(timeout: 5))
        app.typeKey("g", modifierFlags: [.command, .shift])

        let goToSheet = app.sheets.firstMatch
        XCTAssertTrue(goToSheet.waitForExistence(timeout: 5))
        let pathField = goToSheet.textFields.firstMatch
        pathField.click()
        pathField.typeText(documentURL.path)
        goToSheet.buttons["Go"].click()
        openPanel.buttons["Open"].click()
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        XCTAssertTrue(
            editor.staticTexts["Presentation"].waitForExistence(timeout: 10))
    }

    private func selectOnlyElement() {
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        let inspectorWidth = min(max(editor.frame.width * 0.23, 240), 320)
        let canvasCenter = (editor.frame.width - inspectorWidth) / 2
        editor.coordinate(
            withNormalizedOffset: CGVector(dx: canvasCenter / editor.frame.width, dy: 0.5)
        ).tap()
        XCTAssertTrue(editor.buttons["Set step"].waitForExistence(timeout: 5))
    }

    private func switchToolsAndPan() {
        editor.typeKey("h", modifierFlags: [])

        let start = editor.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.8))
        let end = editor.coordinate(withNormalizedOffset: CGVector(dx: 0.74, dy: 0.8))
        start.press(forDuration: 0.1, thenDragTo: end)

        editor.typeKey("v", modifierFlags: [])
    }

    private func replaceRevealStep(with value: String) {
        let field = revealStepField
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

    private func staysUnchangedForAutosaveWindow(_ expectedContents: Data) -> Bool {
        let deadline = Date().addingTimeInterval(6)
        while Date() < deadline {
            guard (try? Data(contentsOf: documentURL)) == expectedContents else { return false }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return (try? Data(contentsOf: documentURL)) == expectedContents
    }

    private var savedElementMetadata: (customData: [String: Any], figuro: [String: Any])? {
        guard
            let data = try? Data(contentsOf: documentURL),
            let document = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let elements = document["elements"] as? [[String: Any]],
            let element = elements.first(where: { $0["id"] as? String == "acceptance-target" }),
            let customData = element["customData"] as? [String: Any],
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
