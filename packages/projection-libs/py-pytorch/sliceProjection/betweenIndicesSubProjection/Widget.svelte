<script lang="ts">
  import { beforeUpdate, onMount } from "svelte";
  import type { EditorState } from "@codemirror/state";
  import type { EditorView } from "@codemirror/view";
  import type { Match } from "@puredit/parser";
  import type { FocusGroup } from "@puredit/projections";
  import { ContextInformation } from "@puredit/projections";
  import { getDimension } from "../utils";

  import TextInput from "@puredit/projections/controls/TextInput.svelte";
  import { highlightingFor } from "@codemirror/language";
  import { tags } from "@lezer/highlight";

  export let isNew: boolean;
  export let focusGroup: FocusGroup;
  export let state: EditorState;
  export let view: EditorView | null;
  export let match: Match;
  export let context: ContextInformation;
  let dimension: string | undefined;

  dimension = getDimension(match, context);

  onMount(() => {
    if (isNew) {
      requestAnimationFrame(() => {
        focusGroup.first();
      });
    }
  });

  beforeUpdate(() => {
    dimension = getDimension(match, context);
  });
</script>

<span class="inline-flex">
  {#if dimension}
    <span>Dimension {dimension} from index</span>
  {:else}
    <span>Select from index</span>
  {/if}
  <TextInput
    className={highlightingFor(state, [tags.atom])}
    node={match.argsToAstNodeMap.startIndex}
    {state}
    {view}
    {focusGroup}
    placeholder="start index"
  />
  <span>to index</span>
  <TextInput
    className={highlightingFor(state, [tags.atom])}
    node={match.argsToAstNodeMap.endIndex}
    {state}
    {view}
    {focusGroup}
    placeholder="end index"
  />
  <span>with stepsize</span>
  <TextInput
    className={highlightingFor(state, [tags.atom])}
    node={match.argsToAstNodeMap.stepSize}
    {state}
    {view}
    {focusGroup}
    placeholder="step size"
  />
</span>
