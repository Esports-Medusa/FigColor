<template>
  <div class="vocabulary-control">
    <div v-if="modelValue.length" class="selected-chips">
      <span v-for="value in modelValue" :key="value" :class="['vocabulary-chip', { legacy: !isAuthoritativeVocabularyValue(field, value) }]">
        {{ vocabularyLabel(value) }}<small v-if="!isAuthoritativeVocabularyValue(field, value)">legacy</small>
        <button type="button" :aria-label="`Remove ${vocabularyLabel(value)}`" :disabled="disabled" @click="remove(value)">×</button>
      </span>
    </div>
    <div class="combobox-wrap">
      <input
        v-model="query"
        role="combobox"
        :aria-label="`${label} search`"
        :aria-expanded="open"
        :aria-controls="listId"
        :disabled="disabled"
        placeholder="Search allowed values…"
        @focus="open = true"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="chooseActive"
        @keydown.esc="open = false"
      />
      <ul v-if="open" :id="listId" role="listbox">
        <li v-for="(value, index) in options" :key="value" role="option" :aria-selected="index === activeIndex">
          <button type="button" :class="{ active: index === activeIndex }" @mousedown.prevent @click="choose(value)">{{ vocabularyLabel(value) }} <code>{{ value }}</code></button>
        </li>
        <li v-if="options.length === 0" class="no-options">No allowed values available.</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isAuthoritativeVocabularyValue, selectableVocabularyValues, vocabularyLabel, type AssistantMetadataField } from './controlledVocabulary'

const props = defineProps<{ modelValue: string[]; field: AssistantMetadataField; label: string; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string[]): void }>()
const query = ref('')
const open = ref(false)
const activeIndex = ref(0)
const listId = `vocabulary-${props.field}`
const options = computed(() => selectableVocabularyValues(props.field, props.modelValue, query.value))
watch(options, () => { activeIndex.value = Math.min(activeIndex.value, Math.max(0, options.value.length - 1)) })
function choose(value: string) { if (!isAuthoritativeVocabularyValue(props.field, value) || props.modelValue.includes(value)) return; emit('update:modelValue', [...props.modelValue, value]); query.value = ''; open.value = true }
function remove(value: string) { emit('update:modelValue', props.modelValue.filter((item) => item !== value)) }
function move(direction: number) { open.value = true; if (options.value.length) activeIndex.value = (activeIndex.value + direction + options.value.length) % options.value.length }
function chooseActive() { const value = options.value[activeIndex.value]; if (value) choose(value) }
</script>

<style scoped>
.selected-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.45rem}.vocabulary-chip{display:inline-flex;align-items:center;gap:.35rem;background:#eef2ff;color:#3730a3;border-radius:999px;padding:.3rem .45rem .3rem .65rem;font-weight:600}.vocabulary-chip.legacy{background:#fff7ed;color:#9a3412}.vocabulary-chip small{font-size:.65rem;text-transform:uppercase}.vocabulary-chip button{padding:0;width:1.25rem;height:1.25rem;border-radius:50%;background:transparent;color:inherit}.combobox-wrap{position:relative}.combobox-wrap>input{width:100%;box-sizing:border-box}.combobox-wrap ul{position:absolute;z-index:30;left:0;right:0;top:calc(100% + .25rem);max-height:220px;overflow:auto;margin:0;padding:.3rem;list-style:none;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 12px 28px rgba(15,23,42,.16)}.combobox-wrap li button{width:100%;display:flex;justify-content:space-between;background:#fff;color:#172033;text-align:left}.combobox-wrap li button:hover,.combobox-wrap li button.active{background:#eef2ff}.combobox-wrap code{color:#64748b}.no-options{padding:.65rem;color:#64748b;font-weight:400}
</style>
