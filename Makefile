SHELL := /bin/bash
APP := apps/macos/build/Build/Products/Debug/Figuro.app
DERIVED_DATA_PATH ?= apps/macos/build
RESULT_BUNDLE_PATH ?=
TEST_ARGS ?=
TEST_TIMEOUT ?= 1200

.PHONY: help install editor-host project build test test-build test-results test-setup run clean

help:
	@echo "make install      Install JavaScript dependencies"
	@echo "make editor-host  Build the Excalidraw editor host"
	@echo "make project      Generate Figuro.xcodeproj with XcodeGen"
	@echo "make build        Build the macOS app"
	@echo "make test         Run macOS acceptance tests"
	@echo "make test-results Export the latest existing Xcode test results"
	@echo "make test-setup   Allow XCTest automation without repeated authentication"
	@echo "make run          Build and launch the macOS app"
	@echo "make clean        Remove build output"

install:
	pnpm install

editor-host:
	apps/macos/Scripts/build-editor-host.sh

# The editor host must exist before generation: the app references it as a
# folder, and XcodeGen resolves that path when the project is created.
project: editor-host
	cd apps/macos && xcodegen generate

build: project
	xcodebuild -project apps/macos/Figuro.xcodeproj -scheme Figuro \
		-configuration Debug -derivedDataPath apps/macos/build build

test:
	FIGURO_TEST_ARGS='$(TEST_ARGS)' python3 scripts/ui-tests.py local \
		--derived-data-path "$(DERIVED_DATA_PATH)" --timeout "$(TEST_TIMEOUT)" \
		$(if $(RESULT_BUNDLE_PATH),--result-bundle-path "$(RESULT_BUNDLE_PATH)")

test-results:
	python3 scripts/ui-tests.py export \
		$(if $(RESULT_BUNDLE_PATH),--result-bundle-path "$(RESULT_BUNDLE_PATH)")

# Low-level build/test entry point. The local command and queue runner export
# its results even when Xcode exits with failed tests.
test-build: project
	xcodebuild -project apps/macos/Figuro.xcodeproj -scheme Figuro \
		-configuration Debug -derivedDataPath "$(DERIVED_DATA_PATH)" \
		$(if $(RESULT_BUNDLE_PATH),-resultBundlePath "$(RESULT_BUNDLE_PATH)") \
		-parallel-testing-enabled NO $(TEST_ARGS) test

# Run interactively on the Mac once; the tool authenticates the administrator.
test-setup:
	/usr/bin/automationmodetool enable-automationmode-without-authentication
	/usr/bin/automationmodetool

run: build
	open $(APP)

clean:
	rm -rf apps/macos/build apps/macos/Figuro.xcodeproj \
		apps/macos/Resources/EditorHost packages/editor-host/dist
