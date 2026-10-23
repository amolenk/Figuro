// THROWAWAY: exact, version-pinned transforms of the 0.18.1 development bundle.
// No installed package files are changed. This is a feasibility seam, not a release patch.
export function patchExcalidraw(source, id) {
  const edits = [];
  const replace = (before, after) => {
    const occurrences = source.split(before).length - 1;
    if (occurrences !== 1) throw new Error(`Prototype patch expected one match, got ${occurrences}: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
    edits.push(before.slice(0, 70));
  };
  if (id.endsWith("/chunk-4FTI6OG3.js")) {
    replace("    name: appState.name,\n    editingGroupId:", "    name: appState.name,\n    documentData: appState.documentData ?? null,\n    editingGroupId:");
    replace("const { name, viewBackgroundColor, ...elementsProps } = delta;", "const { name, viewBackgroundColor, documentData, ...elementsProps } = delta;");
    replace("      selectedGroupIds: isShallowEqual\n", "      selectedGroupIds: isShallowEqual,\n      documentData: (a, b) => JSON.stringify(a) === JSON.stringify(b)\n");
    replace("  static postProcess(deleted, inserted) {\n    try {\n      Delta.diffObjects(", "  static postProcess(deleted, inserted) {\n    if (JSON.stringify(deleted.documentData) === JSON.stringify(inserted.documentData)) {\n      delete deleted.documentData; delete inserted.documentData;\n    }\n    try {\n      Delta.diffObjects(");
    replace("      const prevSnapshot = this.snapshot;\n      const nextSnapshot", "      if (this.prepareDocumentData) {\n        appState = { ...appState, documentData: this.prepareDocumentData(elements, appState.documentData ?? null) };\n      }\n      const prevSnapshot = this.snapshot;\n      const nextSnapshot");
    // Repair optional-value history inversion only at the delta-application seam.
    replace("return newElementWith(element, directlyApplicablePartial);", "return newElementWith(element, directlyApplicablePartial, true);");
  }
  if (id.endsWith("/dev/index.js")) {
    replace("    this.redoStack.length = 0;\n  }\n  /**", "    this.redoStack.length = 0;\n    this.onHistoryChangedEmitter.trigger(new HistoryChangedEvent(true, true));\n  }\n  /**");
    replace("    if (!entry.isEmpty()) {\n      this.undoStack.push(entry.inverse());", "    const documentEdit = !entry.elementsChange.isEmpty() || Object.prototype.hasOwnProperty.call(entry.appStateChange.delta.inserted, \"documentData\") || Object.prototype.hasOwnProperty.call(entry.appStateChange.delta.inserted, \"viewBackgroundColor\");\n    if (!entry.isEmpty() && documentEdit) {\n      this.undoStack.push(entry.inverse());");
    replace("if (!entry.elementsChange.isEmpty()) {", "if (documentEdit) {");
    replace("            this.store.captureIncrement(\n              nextCommittedElements,\n              nextCommittedAppState\n            );", "            this.store.captureIncrement(\n              nextCommittedElements,\n              nextCommittedAppState\n            );\n            sceneData.appState = { ...sceneData.appState, documentData: this.store.snapshot.appState.documentData };");
    replace("        history: {\n          clear: this.resetHistory\n        },", `        history: {
          clear: this.resetHistory,
          getStatus: () => ({
            canUndo: !this.history.isUndoStackEmpty,
            canRedo: !this.history.isRedoStackEmpty,
            undoEntries: this.history.undoStack.length,
            redoEntries: this.history.redoStack.length,
            busy: !!(this.state.multiElement || this.state.resizingElement || this.state.editingTextElement || this.state.newElement || this.state.selectedElementsAreBeingDragged || this.state.selectionElement || this.flowChartCreator.isCreatingChart)
          }),
          onStatus: (callback) => this.history.onHistoryChangedEmitter.on(callback),
          onCommit: (callback) => this.store.onStoreIncrementEmitter.on(callback),
          prepareDocumentData: (callback) => { this.store.prepareDocumentData = callback; },
          execute: (direction) => {
            const state = this.state;
            if (state.multiElement || state.resizingElement || state.editingTextElement || state.newElement || state.selectedElementsAreBeingDragged || state.selectionElement || this.flowChartCreator.isCreatingChart) return "busy";
            const empty = direction === "undo" ? this.history.isUndoStackEmpty : this.history.isRedoStackEmpty;
            if (empty) return "empty";
            const action = direction === "undo" ? createUndoAction(this.history, this.store) : createRedoAction(this.history, this.store);
            this.syncActionResult(action.perform(this.getSceneElementsIncludingDeleted(), this.state, null, this));
            return "applied";
          }
        },`);
    // Apply derived metadata from the committed snapshot only for durable commits.
    // A production implementation should carry this through the micro-action result.
    replace("    this.store.commit(elementsMap, this.state);", "    const prototypeCaptured = this.store.scheduledActions.has(CaptureUpdateAction.IMMEDIATELY);\n    this.store.commit(elementsMap, this.state);\n    if (prototypeCaptured && JSON.stringify(this.state.documentData ?? null) !== JSON.stringify(this.store.snapshot.appState.documentData)) {\n      this.setState({ documentData: this.store.snapshot.appState.documentData });\n      return;\n    }");
  }
  return edits.length ? { code: source, map: null } : null;
}
