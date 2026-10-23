import XCTest

@MainActor
final class UnifiedHistoryPrototypeTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-ApplePersistenceIgnoreState", "YES"]
        app.launchEnvironment["FIGURO_SKIP_DEFAULT_APP_REQUEST"] = "1"
        app.launch()
        if !app.buttons["draw"].firstMatch.waitForExistence(timeout: 3) {
            app.typeKey("n", modifierFlags: .command)
        }
        XCTAssertTrue(app.buttons["draw"].firstMatch.waitForExistence(timeout: 15))
        expect("Shapes=0", "Cards=0", "Undo=0", "Dirty=no")
    }
    override func tearDown() async throws {
        if testRun?.failureCount ?? 0 > 0 {
            let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            screenshot.lifetime = .keepAlways; add(screenshot)
        }
        app?.terminate()
    }
    private var state: XCUIElement { app.staticTexts["native-history-state"].firstMatch }
    private func expect(_ parts: String..., file: StaticString = #filePath, line: UInt = #line) {
        let check = NSPredicate { _, _ in
            let text = (self.state.value as? String ?? "") + self.state.label
            return parts.allSatisfy { text.contains($0) }
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: check, object: nil)], timeout: 10), .completed, "Expected \(parts); got \(state.value ?? state.label)", file: file, line: line)
    }
    private func click(_ title: String) { app.buttons[title].firstMatch.click() }
    private func menu(_ title: String) {
        app.menuBars.menuBarItems["Edit"].click()
        let item = app.menuItems[title].firstMatch
        XCTAssertTrue(item.isEnabled, "\(title) should be enabled")
        item.click()
    }
    func testNativeMenusChronologySaveAndBranching() {
        click("draw");click("pause");click("move")
        expect("Shapes=1", "X=260", "Cards=1", "Undo=3", "Dirty=yes")
        click("Focus drawing");menu("Undo")
        expect("X=200", "Cards=1", "Undo=2", "Redo=1", "Requests=1")
        app.typeKey("z", modifierFlags: .command)
        expect("Cards=0", "Undo=1", "Requests=2")
        app.typeKey("z", modifierFlags: .command)
        expect("Shapes=0", "Undo=0", "Dirty=no", "Requests=3")
        app.typeKey("z", modifierFlags: [.command, .shift])
        expect("Shapes=1", "Undo=1", "Requests=4")
        menu("Redo");menu("Redo")
        expect("X=260", "Cards=1", "Undo=3", "Redo=0", "Requests=6")
        click("Snapshot save");expect("Dirty=no")
        click("Focus drawing");menu("Undo");expect("X=200", "Dirty=yes")
        menu("Redo");expect("X=260", "Dirty=no")
        menu("Undo");click("pause");expect("Cards=2", "Redo=0")
        app.menuBars.menuBarItems["Edit"].click()
        XCTAssertFalse(app.menuItems["Redo"].firstMatch.isEnabled)
        app.typeKey(XCUIKeyboardKey.escape.rawValue, modifierFlags: [])
    }
    func testFocusedDOMAndNativeTextUndo() {
        click("draw");click("pause");expect("Undo=2")
        let title = app.textFields["Click title"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.click();app.typeKey("a", modifierFlags: .command);title.typeText("draft")
        expect("Text=yes", "Title=Pause", "Undo=2")
        app.typeKey("z", modifierFlags: .command)
        expect("Title=Pause", "Undo=2", "Requests=0")
        XCTAssertNotEqual(title.value as? String, "draft", "DOM draft undo should edit the text, not the document")
        let native = app.textFields["native-draft"].firstMatch
        native.click();native.typeText("native draft")
        app.typeKey("z", modifierFlags: .command)
        XCTAssertNotEqual(native.value as? String, "native draft")
        expect("Shapes=1", "Cards=1", "Requests=0")
    }
    func testDocumentWindowRoutingAndRapidCommands() {
        func newWindow() -> XCUIElement {
            let existing = Set(app.windows.allElementsBoundByIndex.map(\.identifier))
            app.typeKey("n", modifierFlags: .command)
            let created = NSPredicate { _, _ in
                self.app.windows.allElementsBoundByIndex.contains {
                    $0.identifier.hasPrefix("history-window-") && !existing.contains($0.identifier)
                }
            }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: created, object: nil)], timeout: 10), .completed)
            let identifier = app.windows.allElementsBoundByIndex.first {
                $0.identifier.hasPrefix("history-window-") && !existing.contains($0.identifier)
            }!.identifier
            return app.windows[identifier]
        }
        let first = newWindow()
        XCTAssertTrue(first.buttons["draw"].firstMatch.waitForExistence(timeout: 10))
        first.buttons["draw"].firstMatch.click()
        first.buttons["pause"].firstMatch.click()
        let firstState = first.staticTexts["native-history-state"].firstMatch
        let firstReady = NSPredicate { _, _ in (firstState.value as? String ?? "").contains("Undo=2") }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: firstReady, object: nil)], timeout: 10), .completed)
        let second = newWindow()
        let secondState = second.staticTexts["native-history-state"].firstMatch
        XCTAssertTrue(secondState.waitForExistence(timeout: 5))
        XCTAssertTrue(second.buttons["draw"].firstMatch.waitForExistence(timeout: 10))
        second.buttons["draw"].firstMatch.click()
        second.buttons["Focus drawing"].firstMatch.click()
        app.typeKey("z", modifierFlags: .command)
        let secondEmpty = NSPredicate { _, _ in (secondState.value as? String ?? "").contains("Shapes=0") }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: secondEmpty, object: nil)], timeout: 10), .completed)
        XCTAssertTrue((firstState.value as? String ?? "").contains("Shapes=1"))
        XCTAssertTrue((firstState.value as? String ?? "").contains("Cards=1"))
        app.menuBars.menuBarItems["Window"].click()
        app.menuItems["Activate \(first.identifier)"].firstMatch.click()
        first.buttons["Focus drawing"].firstMatch.click()
        let firstFocused = NSPredicate { _, _ in (firstState.value as? String ?? "").contains("Key=yes") && (firstState.value as? String ?? "").contains("Text=no") }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: firstFocused, object: nil)], timeout: 10), .completed)
        app.typeKey("z", modifierFlags: .command)
        app.typeKey("z", modifierFlags: .command)
        let firstEmpty = NSPredicate { _, _ in (firstState.value as? String ?? "").contains("Shapes=0") && (firstState.value as? String ?? "").contains("Cards=0") }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: firstEmpty, object: nil)], timeout: 10), .completed, "First: \(firstState.value ?? "nil"); second: \(secondState.value ?? "nil")")
    }
}
