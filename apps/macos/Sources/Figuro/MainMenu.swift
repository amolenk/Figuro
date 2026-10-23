import AppKit

/// Builds the application menu bar in code.
///
/// Undo and Redo are deliberately absent in Phase 1. Excalidraw owns the
/// drawing history inside the web view, and a native menu item would capture
/// Cmd-Z without being able to service it. Undo is reached through the
/// editor's own keyboard handling until the bridge exposes history state.
enum MainMenu {
    static func install(into app: NSApplication) {
        let mainMenu = NSMenu()
        mainMenu.addItem(appMenuItem())
        mainMenu.addItem(fileMenuItem())
        mainMenu.addItem(editMenuItem())
        mainMenu.addItem(windowMenuItem(app: app))
        app.mainMenu = mainMenu
    }

    private static func submenu(_ title: String, _ build: (NSMenu) -> Void) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let menu = NSMenu(title: title)
        build(menu)
        item.submenu = menu
        return item
    }

    private static func appMenuItem() -> NSMenuItem {
        submenu("Figuro") { menu in
            menu.addItem(
                withTitle: "About Figuro",
                action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
                keyEquivalent: "")
            menu.addItem(.separator())
            menu.addItem(
                withTitle: "Make Default for .excalidraw…",
                action: #selector(AppDelegate.makeDefaultExcalidrawApplication(_:)),
                keyEquivalent: "")
            menu.addItem(.separator())
            menu.addItem(
                withTitle: "Hide Figuro",
                action: #selector(NSApplication.hide(_:)),
                keyEquivalent: "h")
            menu.addItem(.separator())
            menu.addItem(
                withTitle: "Quit Figuro",
                action: #selector(NSApplication.terminate(_:)),
                keyEquivalent: "q")
        }
    }

    private static func fileMenuItem() -> NSMenuItem {
        submenu("File") { menu in
            menu.addItem(
                withTitle: "New",
                action: #selector(NSDocumentController.newDocument(_:)),
                keyEquivalent: "n")
            menu.addItem(
                withTitle: "Open…",
                action: #selector(NSDocumentController.openDocument(_:)),
                keyEquivalent: "o")
            menu.addItem(.separator())
            menu.addItem(
                withTitle: "Close",
                action: #selector(NSWindow.performClose(_:)),
                keyEquivalent: "w")
            menu.addItem(
                withTitle: "Save…",
                action: #selector(NSDocument.save(_:)),
                keyEquivalent: "s")
            menu.addItem(
                withTitle: "Revert to Saved",
                action: #selector(NSDocument.revertToSaved(_:)),
                keyEquivalent: "")
            menu.addItem(.separator())

            let exportItem = NSMenuItem(title: "Export", action: nil, keyEquivalent: "")
            let exportMenu = NSMenu(title: "Export")
            exportMenu.addItem(
                withTitle: "SVG…",
                action: #selector(Document.exportSVG(_:)),
                keyEquivalent: "")
            exportMenu.addItem(
                withTitle: "PNG…",
                action: #selector(Document.exportPNG(_:)),
                keyEquivalent: "")
            exportItem.submenu = exportMenu
            menu.addItem(exportItem)
        }
    }

    private static func editMenuItem() -> NSMenuItem {
        submenu("Edit") { menu in
            menu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
            menu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
            menu.addItem(
                withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
            menu.addItem(
                withTitle: "Select All",
                action: #selector(NSText.selectAll(_:)),
                keyEquivalent: "a")
        }
    }

    private static func windowMenuItem(app: NSApplication) -> NSMenuItem {
        let item = submenu("Window") { menu in
            menu.addItem(
                withTitle: "Minimize",
                action: #selector(NSWindow.performMiniaturize(_:)),
                keyEquivalent: "m")
            menu.addItem(
                withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
            menu.addItem(.separator())
            menu.addItem(
                withTitle: "Bring All to Front",
                action: #selector(NSApplication.arrangeInFront(_:)),
                keyEquivalent: "")
        }
        app.windowsMenu = item.submenu
        return item
    }
}
