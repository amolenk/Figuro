import AppKit

// The delegate is installed before AppKit's launch sequence begins, so that
// `applicationWillFinishLaunching` runs and the menu bar exists. Launching then
// proceeds through `NSApplicationMain`, which keeps window state restoration on
// its normal schedule.
let delegate = AppDelegate()
NSApplication.shared.delegate = delegate
_ = NSApplicationMain(CommandLine.argc, CommandLine.unsafeArgv)
