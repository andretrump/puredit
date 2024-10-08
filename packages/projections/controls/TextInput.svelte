<script lang="ts">
  import type { ChangeSpec, EditorState } from "@codemirror/state";
  import type { EditorView } from "@codemirror/view";
  import { onDestroy } from "svelte";
  import { compareTwoStrings } from "string-similarity";
  import type { FocusGroup } from "../widget/focus";
  import {
    escapeString,
    getCode,
    isStringNode,
    simpleStringLiteralValueChange,
    stringLiteralValue,
    stringLiteralValueChange,
  } from "../shared";
  import AstNode from "@puredit/parser/ast/node";
  import { rematchEffect } from "../state/stateField";

  export let view: EditorView | null;
  export let node: AstNode;
  export let state: EditorState;
  let nodeType = node.type;

  export let targetNodes: AstNode[] | null = null;

  export let className: string | null = null;
  export let placeholder = "text";
  export let focusGroup: FocusGroup | null = null;

  let input: HTMLInputElement | undefined;
  $: if (input && focusGroup) {
    focusGroup.registerElement(input);
  }

  onDestroy(() => {
    if (input && focusGroup) {
      focusGroup.unregisterElement(input);
    }
  });

  function handleEmptyCodeToValue(code: string): string {
    if (code.startsWith("__empty_")) {
      nodeType = code.slice("__empty_".length);
      return "";
    }
    nodeType = node.type;
    return code;
  }

  function handleEmptyValueToCode(value: string): string {
    if (!value) {
      return `__empty_${nodeType}`;
    }
    return value;
  }

  function triggerRematching() {
    view?.dispatch({
      effects: rematchEffect.of(null),
    });
  }

  type ValidationFunction = (value: string) => string | undefined;
  export let validate: ValidationFunction | null = null;
  let error: string | undefined;
  $: if (validate) {
    error = validate(value);
  }

  // The displayed code right after the last rematching
  let originalCode = getCode(node, state.doc);
  let fromBefore = node.startIndex;
  let toBefore = node.endIndex;
  $: if (fromBefore !== node.startIndex || toBefore !== node.endIndex) {
    originalCode = getCode(node, state.doc);
    fromBefore = node.startIndex;
    toBefore = node.endIndex;
  }

  // The code before the text change being currently processed
  let previousCode: string | undefined;
  $: previousCode = getCode(node, state.doc);

  // The text displayed in the text field
  let value = "";
  $: {
    value = handleEmptyCodeToValue(stringLiteralValue(node, state.doc));
    // Sometimes the value displayed in the field des not update
    // so we update it manually
    if (input) {
      input.value = value;
    }
  }

  function onInput(e: { currentTarget: HTMLInputElement }) {
    updateValue(e.currentTarget.value);
  }

  function allSameLength(nodes: AstNode[]) {
    if (nodes.length === 0) return true;
    const length = nodes[0].text.length;
    return nodes.every((node) => node.text.length === length);
  }

  function updateValue(newValue: string) {
    let newCode: string;
    if (isStringNode(node)) {
      newCode = handleEmptyValueToCode(escapeString(newValue));
    } else {
      newCode = handleEmptyValueToCode(newValue);
    }

    let changes: ChangeSpec;
    if (targetNodes && !allSameLength(targetNodes)) {
      changes =
        targetNodes?.map((targetNode) => simpleStringLiteralValueChange(targetNode, newCode)) ??
        simpleStringLiteralValueChange(node, newCode);
      view?.dispatch({
        filter: false,
        changes,
      });
      triggerRematching();
    } else {
      const delta = previousCode.length - originalCode.length;
      changes =
        targetNodes?.map((targetNode, index) =>
          stringLiteralValueChange(targetNode, previousCode, newCode, delta * index)
        ) ?? stringLiteralValueChange(node, previousCode, newCode);
      view?.dispatch({
        filter: false,
        changes,
      });
    }
    previousCode = newCode;
  }

  function onKeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    // Completion
    if (sortedCompletions.length) {
      if (e.key === "ArrowUp") {
        selectedCompletion -= 1;
        if (selectedCompletion < 0) {
          selectedCompletion += sortedCompletions.length;
        }
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        selectedCompletion += 1;
        if (selectedCompletion >= sortedCompletions.length) {
          selectedCompletion -= sortedCompletions.length;
        }
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        updateValue(sortedCompletions[selectedCompletion]);
        focusGroup?.next(e.currentTarget);
        e.preventDefault();
        return;
      }
    }

    // Focus management
    const pos = e.currentTarget.selectionStart;
    if (!focusGroup || pos !== e.currentTarget.selectionEnd) {
      return;
    }
    if (e.key === "ArrowLeft" && pos === 0) {
      e.preventDefault();
      triggerRematching();
      focusGroup.previous(e.currentTarget);
    } else if (e.key === "ArrowRight" && pos === e.currentTarget.value.length) {
      e.preventDefault();
      triggerRematching();
      focusGroup.next(e.currentTarget);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        triggerRematching();
        focusGroup.previous(e.currentTarget);
      } else {
        triggerRematching();
        focusGroup.next(e.currentTarget);
      }
    }
  }

  export let completions: string[] = [];
  let sortedCompletions = completions;
  let selectedCompletion = 0;
  $: {
    sortedCompletions = completions.concat();
    if (value) {
      let scores = completions.reduce((acc, completion) => {
        if (!Object.prototype.hasOwnProperty.call(acc, completion)) {
          acc[completion] = compareTwoStrings(value, completion);
        }
        return acc;
      }, {} as Record<string, number>);
      sortedCompletions.sort((a, b) => scores[b] - scores[a]);
    }
    selectedCompletion = 0;
  }

  let pointerEnterTimeout: number | undefined = undefined;
  let showTooltipError = false;
  function onPointerEnter() {
    pointerEnterTimeout = window.setTimeout(() => {
      pointerEnterTimeout = undefined;
      showTooltipError = true;
    }, 500);
  }
  function onPointerLeave() {
    if (pointerEnterTimeout) {
      clearTimeout(pointerEnterTimeout);
    }
    showTooltipError = false;
  }
</script>

<label
  data-value={value || placeholder}
  on:pointerenter={onPointerEnter}
  on:pointerleave={onPointerLeave}
>
  <input
    class="{className} {error ? 'input-error' : ''}"
    bind:this={input}
    type="text"
    {placeholder}
    size="1"
    {value}
    on:input={onInput}
    on:keydown={onKeydown}
  />
  {#if error || sortedCompletions.length}
    <div class="tooltip {showTooltipError && error ? 'show-tooltip-error' : ''}">
      {#if sortedCompletions.length}
        <ul class="tooltip-completion {error ? 'with-border' : ''}">
          {#each sortedCompletions as completion, i}
            <li
              class={selectedCompletion === i ? "selected" : ""}
              on:pointerdown={() => {
                updateValue(completion);
                if (focusGroup && input) {
                  focusGroup?.next(input);
                }
              }}
            >
              {completion}
            </li>
          {/each}
        </ul>
      {/if}
      {#if error}
        <div class="tooltip-error" title={error}>
          ⚠ {error}
        </div>
      {/if}
    </div>
  {/if}
</label>

<style lang="scss">
  /* Reset style overrides of editor */
  label {
    caret-color: #528bff !important;
    & ::selection {
      background: #3e4451 !important;
    }
    & :focus::selection {
      background: #3e4451 !important;
    }
  }

  label {
    display: inline-grid;
    vertical-align: top;
    align-items: center;
    position: relative;
    margin: 0 5px;

    &::after {
      content: attr(data-value);
      visibility: hidden;
      white-space: pre-wrap;
    }
  }

  input {
    position: relative;

    &::placeholder {
      color: gray;
    }

    &:hover {
      border-color: inherit;
      border-style: dashed;
    }

    &:focus-within {
      border-color: inherit;
      border-style: solid;
    }
  }

  label::after,
  input {
    width: auto;
    min-width: 1em;
    grid-area: 1 / 2;
    font: inherit;
    margin: 0;
    resize: none;
    background: none;
    appearance: none;
    outline: none;

    display: inline-block;
    padding: 2px 4px;
    border: 1px solid transparent;
    border-radius: 3px;
  }

  .input-error {
    text-decoration-line: underline;
    text-decoration-style: wavy;
    text-decoration-color: #d11;
  }

  .tooltip {
    display: none;
    position: absolute;
    left: 0;
    top: 100%;
    background-color: #111;
    color: #eee;
    z-index: 100;
    border-radius: 4px;
    font-size: 12px;
    padding: 5px 0;
    white-space: nowrap;
    min-width: 100%;
    border: 1px solid #555;

    label:focus-within > &,
    &.show-tooltip-error {
      display: block;
    }

    &.show-tooltip-error {
      z-index: 101;
    }
  }

  .tooltip-error {
    padding: 5px 10px;
    text-overflow: ellipsis;
    overflow-x: hidden;
    max-width: 300px;
    font-family: var(--system-font, sans-serif);
  }

  .tooltip-completion {
    list-style: none;
    margin: 0;
    padding: 0;

    label:not(:focus-within) > .show-tooltip-error > & {
      display: none;
    }

    &.with-border {
      border-bottom: 1px solid #333;
      padding-bottom: 5px;
      margin-bottom: 5px;
    }

    & > li {
      padding: 5px 10px;
      cursor: pointer;

      &.selected,
      &:hover {
        background-color: #333;
        color: #fff;
      }

      &.selected {
        text-decoration: underline;
      }
    }
  }
</style>
