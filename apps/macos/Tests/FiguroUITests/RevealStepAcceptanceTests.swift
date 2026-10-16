import XCTest

@MainActor
final class RevealStepAcceptanceTests: XCTestCase {
    private var app: XCUIApplication!
    private var documentURL: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false

        let fixture = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "reveal-step", withExtension: "excalidraw"))
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

    func testSelectedElementRevealStepSurvivesSaveAndReopenAndCanBeCleared() throws {
        let originalContents = try Data(contentsOf: documentURL)
        app = XCUIApplication()
        app.launch()
        openDocument()
        selectOnlyElement()
        switchToolsAndPan()
        XCTAssertTrue(staysUnchangedForAutosaveWindow(originalContents))

        let stepField = revealStepField
        XCTAssertTrue(stepField.waitForExistence(timeout: 10))
        stepField.click()
        stepField.typeText("3")
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

    private func saveDocument() {
        app.typeKey("s", modifierFlags: .command)
    }

    private func waitForSavedStep(_ expectedStep: Int?) -> Bool {
        let deadline = Date().addingTimeInterval(10)
        repeat {
            if savedStep == expectedStep { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while Date() < deadline
        return savedStep == expectedStep
    }

    private func staysUnchangedForAutosaveWindow(_ expectedContents: Data) -> Bool {
        let deadline = Date().addingTimeInterval(6)
        while Date() < deadline {
            guard (try? Data(contentsOf: documentURL)) == expectedContents else { return false }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return (try? Data(contentsOf: documentURL)) == expectedContents
    }

    private var savedStep: Int? {
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
        return metadata["step"] as? Int
    }

    private func assertUnrelatedAndUnknownMetadataArePreserved(step: Int?) {
        guard
            let data = try? Data(contentsOf: documentURL),
            let document = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let elements = document["elements"] as? [[String: Any]],
            let element = elements.first(where: { $0["id"] as? String == "acceptance-target" }),
            let customData = element["customData"] as? [String: Any],
            let metadata = customData["figuro"] as? [String: Any]
        else {
            XCTFail("The saved element or its Figuro metadata is missing")
            return
        }

        XCTAssertEqual(customData["owner"] as? String, "acceptance-fixture")
        XCTAssertEqual(metadata["v"] as? Int, 1)
        XCTAssertEqual(metadata["futureField"] as? [String: Bool], ["keep": true])
        XCTAssertEqual(metadata["step"] as? Int, step)
    }
}
