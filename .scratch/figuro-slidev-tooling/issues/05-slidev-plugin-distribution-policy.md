# Choose the Slidev plugin distribution policy

GitHub issue: [Choose the Slidev plugin distribution policy](https://github.com/amolenk/Figuro/issues/4)

Type: grilling
Assignee: OpenCode
Status: resolved
Blocked by: [Research Slidev integration capabilities](https://github.com/amolenk/Figuro/issues/2)
Depends on: [Research Slidev integration capabilities](02-slidev-integration-capabilities.md)

## Question

What installation, release, and version-compatibility policy should the specification require so the Slidev integration is reusable across decks? Choose the appropriate package/distribution channel and the compatibility expectations for Slidev and Figuro-produced files, informed by the Slidev capability research.

## Answer

- Distribute the integration as the public npm package `@figuro/slidev`, consumed through Slidev's addon mechanism. Release it independently from the macOS app and follow SemVer for the package's public contract.
- Initially support Slidev 53.x. Declare the supported range as a peer dependency and test against that range; expand it only after compatibility is verified.
- Support unannotated Excalidraw files and files with Figuro presentation metadata v1, independent of which compatible Figuro app release produced them. The plugin and app do not need to be in release lockstep. Compatibility through third-party tools remains conditional on those tools preserving the standard scene JSON and `customData`.
