# Docker-sandboxed UI test options for Figuro

**Context:** [Research Docker-sandboxed UI test options for Figuro (#11)](https://github.com/amolenk/Figuro/issues/11), child of [Figuro + Slidev Excalidraw tooling (#1)](https://github.com/amolenk/Figuro/issues/1).<br>
**Research date:** 2026-10-15

## Answer

Use Linux containers for the Slidev web fixture and its browser-driven acceptance checks. Run Figuro's native document/inspector acceptance checks with XCTest/XCUITest on macOS. Docker Desktop on a Mac can make the two workflows convenient to invoke together, but it does not make the macOS test execute inside the Linux container. For CI, split the work into a Linux web-test job and a macOS native-test job; GitHub-hosted macOS runners are a practical starting point.

## What the tests need to prove

Issue [#9's handoff criteria](https://github.com/amolenk/Figuro/issues/9) defines two distinct acceptance surfaces:

- **Slidev fixture deck:** one `.excalidraw` file per `<FiguroDiagram>` slide; unannotated and step-0 elements initially visible; click reveals grouped by distinct positive step, with gaps consuming no clicks; normal slide navigation after the final reveal; general and role CSS affect only matching rendered properties; rendering does not mutate the source file.
- **Figuro native app:** ordinary editing and the Presentation inspector end to end; single/multi-selection including arrows; mixed values; set, change, and clear presentation step/role; save/reopen; preserve v1 metadata, unrelated `customData`, unknown v1 fields, and opaque unknown schema versions.

Figuro's current macOS target is an AppKit `NSDocument` app whose `EditorViewController` constructs a `WKWebView`, loads bundled web assets through a custom URL scheme, and bridges JavaScript messages to the native document. That integration boundary is part of native acceptance, not just a browser page. See [`Document.swift`](../apps/macos/Sources/Figuro/Document.swift), [`EditorViewController.swift`](../apps/macos/Sources/Figuro/EditorViewController.swift), and [`project.yml`](../apps/macos/project.yml).

## Feasibility by execution boundary

| Test surface | Linux Docker container | macOS host or runner |
| --- | --- | --- |
| Slidev web fixture in a browser | **Yes.** Run Slidev/Vite and a browser test runner (for example, Playwright with Chromium) in a Linux image. This can verify the fixture-deck reveal, styling, and file-immutability behavior. | Also possible, but not needed for the primary cross-platform web acceptance suite. |
| Pure format/metadata logic | **Potentially.** It can run on Linux if implemented in platform-independent JS/TS or a Foundation-only shared target. AppKit-bound `Document.swift` itself is not portable as-is. | Yes. |
| Native Figuro document and inspector UI | **No.** A Linux container cannot load AppKit, Apple's `NSDocument`, or Apple's `WKWebView`, and cannot exercise the actual macOS app's menu/window/file lifecycle or native-to-web bridge. | **Yes.** Use XCTest/XCUITest to launch Figuro, open a fixture document, interact with the inspector, then verify save/reopen behavior. |
| Actual embedded Apple WebKit behavior | **No.** Linux Playwright WebKit is a Playwright-maintained WebKit build, not the branded Safari browser or the app's `WKWebView`. | **Yes.** The native app runs with Apple's WebKit framework on macOS. |

Docker documents that containers share the host kernel, and Docker Desktop for Mac runs Docker Engine in a lightweight **Linux VM**. CPU-architecture emulation or a multi-platform image does not supply a macOS kernel or Apple's frameworks. Therefore, a macOS app cannot become an in-container Linux workload merely because Docker Desktop itself is installed on a Mac. [Docker: Multi-platform builds](https://docs.docker.com/build/building/multi-platform/), [Docker Desktop networking overview](https://docs.docker.com/desktop/features/networking/).

## Options compared

### 1. Run the web fixture in Linux Docker

This is the clean Docker boundary for the Slidev checks. Slidev is a Node/Vue/Vite web application, and its v53 getting-started guide requires Node.js 22.12.0 or later. Playwright publishes Linux Docker images containing supported browser binaries and system dependencies, and documents running end-to-end tests in those images. Pin the Playwright image/version together with the project dependency to keep the browser binary and Playwright package aligned. [Slidev v53 Getting Started](https://sli.dev/guide/), [Playwright Docker](https://playwright.dev/docs/docker).

Use the web fixture suite to validate the complete browser-visible contract, rather than relying only on component or metadata unit tests. A Linux Chromium run is suitable for that contract. If also running Playwright WebKit on Linux, treat it as another web-engine check, not as validation of Figuro's embedded macOS `WKWebView`: Playwright says its WebKit derives from WebKit main and does not work with branded Safari. [Playwright browsers](https://playwright.dev/docs/browsers#webkit).

The repo currently requires Node.js 20+ for its build, while Slidev v53's current guide says Node.js >=22.12.0. The container that runs the Slidev fixture must satisfy Slidev's requirement; that is not an additional Figuro-native-app requirement. [Figuro README requirements](../README.md#requirements), [Slidev v53 Getting Started](https://sli.dev/guide/).

### 2. Let a Docker container orchestrate native macOS tests

Docker Desktop networking allows a container to connect to host services through `host.docker.internal`. In principle, a container could call a host-side script/service that invokes `xcodebuild test`, or use SSH to request work from a Mac runner. Docker documents this as connectivity to a service running on the host; it is not a mechanism for running host macOS executables or frameworks in the Linux container. [Docker Desktop: Connect a container to a service on the host](https://docs.docker.com/desktop/features/networking/networking-how-tos/#connect-a-container-to-a-service-on-the-host).

This arrangement can provide one command-line entry point, but the test process, XCTest runner, Figuro app, and UI automation still execute on macOS. It also requires a host-side command endpoint, result/artifact handoff, and careful lifecycle coordination. It is an optional local orchestration layer, not a stronger container sandbox for the native test.

For local development, the simplest reliable boundary is to run web tests in Docker Desktop and run native tests directly on the Mac with Xcode. If a unified command is later valuable, have it dispatch the native test to a host-side script while clearly treating that step as host execution.

### 3. Run native acceptance checks on macOS in CI

Apple's XCTest documentation describes XCTest as the framework for unit, performance, and UI tests. Its XCUIAutomation API provides `XCUIApplication` to launch, monitor, activate, and terminate a test app; the API is available for macOS. Xcode can run a test plan with `xcodebuild test`. Together, these are the native path for verifying Figuro's app/document/inspector flow. [Apple: XCTest](https://developer.apple.com/documentation/xctest), [Apple: XCUIApplication](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication), [Apple: Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results).

GitHub Actions offers macOS hosted VM runners with Xcode installed. Its current runner reference includes `macos-15` labels, and the macOS 15 runner image lists Xcode 16 versions. Figuro targets macOS 14+ and the repo specifies Xcode 16+, so a macOS 15 runner is a practical initial CI target; select the intended Xcode version explicitly if repeatability across image updates matters. GitHub's runner images are updated over time, so verify the chosen image and Xcode selection in the workflow. [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [GitHub macOS 15 runner image](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md), [Figuro project target](../apps/macos/project.yml).

A self-hosted Mac is another first-party-supported option when CI needs a controlled macOS/Xcode image or access to local services. It places OS, Xcode, and runner maintenance on the project owner, and unlike a fresh hosted VM, the host may retain state between jobs. [GitHub: Self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners).

## Recommended arrangement

1. **Local development:** run the Slidev fixture/browser suite in Docker Desktop on Linux; run the macOS native XCTest/XCUITest target on the Mac host with `xcodebuild test`.
2. **CI:** use a Linux job/container for Slidev fixture acceptance checks and a separate GitHub-hosted `macos-15` job for native app acceptance checks. Build the editor-host assets and app on the Mac job, then run the Xcode test scheme there. If the project later needs a pinned or specialized environment, move that job to a maintained self-hosted Mac.
3. **Test division:** keep presentation rendering/reveal/CSS/source-immutability assertions in the web suite; reserve AppKit document lifecycle, native inspector interactions, save/reopen, and the actual JavaScript↔`WKWebView` integration for macOS. Put format-only contract checks in a portable suite only where their implementation can run without AppKit/WebKit.
4. **Automation:** use XCUITest for the native UI acceptance path rather than attempting to drive Figuro via a Linux browser. Apple provides application launch/open and UI automation APIs; stable accessibility identifiers and deterministic fixture opening will make the checks more robust. `XCUIApplication` supports opening a URL and passing launch arguments/environment when a test needs to select a fixture. [Apple: XCUIApplication](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication).

This meets the ticket's Docker-sandbox goal for the web fixture while preserving a genuine platform test for the native app. No test infrastructure or application code was changed as part of this research.

## Source list

All external references below are first-party documentation for the product or platform they describe.

- Apple, [XCTest](https://developer.apple.com/documentation/xctest)
- Apple, [XCUIApplication](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication)
- Apple, [Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results)
- Apple, [NSDocument](https://developer.apple.com/documentation/appkit/nsdocument)
- Apple, [WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)
- Docker, [Multi-platform builds](https://docs.docker.com/build/building/multi-platform/)
- Docker, [Networking on Docker Desktop](https://docs.docker.com/desktop/features/networking/)
- Docker, [Connect a container to a service on the host](https://docs.docker.com/desktop/features/networking/networking-how-tos/#connect-a-container-to-a-service-on-the-host)
- Slidev, [Getting Started (v53.0.0)](https://sli.dev/guide/)
- Microsoft Playwright, [Docker](https://playwright.dev/docs/docker)
- Microsoft Playwright, [Browsers / WebKit](https://playwright.dev/docs/browsers#webkit)
- GitHub, [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- GitHub Actions, [macOS 15 runner image](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)
- GitHub, [Self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners)
