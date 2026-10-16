SHELL := /bin/bash
APP := apps/macos/build/Build/Products/Debug/Figuro.app

.PHONY: help install editor-host project build test run clean

help:
	@echo "make install      Install JavaScript dependencies"
	@echo "make editor-host  Build the Excalidraw editor host"
	@echo "make project      Generate Figuro.xcodeproj with XcodeGen"
	@echo "make build        Build the macOS app"
	@echo "make test         Run macOS acceptance tests"
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

test: project
	xcodebuild -project apps/macos/Figuro.xcodeproj -scheme Figuro \
		-configuration Debug -derivedDataPath apps/macos/build test

run: build
	open $(APP)

clean:
	rm -rf apps/macos/build apps/macos/Figuro.xcodeproj \
		apps/macos/Resources/EditorHost packages/editor-host/dist
