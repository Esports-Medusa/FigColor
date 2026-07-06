# Palette Schema v1

## Palette Object

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `id` | `string` | ✅ | Unique identifier |
| `name` | `string` | ✅ | Human-readable name |
| `slug` | `string` | ✅ | URL-friendly name |
| `colors` | `PaletteColor[]` | ✅ | Color list with HEX and RGB |
| `journal_style` | `string[]` | ✅ | Journal/顶刊 style |
| `chart_type` | `string[]` | ✅ | Suitable chart types |
| `color_count` | `number` | ✅ | Number of colors |
| `use_case` | `string[]` | ✅ | Suitable use cases |
| `avoid_case` | `string[]` | ✅ | Cases to avoid |
| `discipline` | `string[]` | ✅ | Research fields |
| `tags` | `string[]` | ✅ | Additional tags |
| `created_at` | `string` | ✅ | Creation timestamp (ISO 8601) |
| `updated_at` | `string` | ✅ | Last update timestamp (ISO 8601) |

## PaletteColor Object

| Field | Type | Description |
|-------|------|-------------|
| `hex` | `string` | Hex color code (e.g., "#4E79A7") |
| `rgb` | `[number, number, number]` | RGB tuple (e.g., `[78, 121, 167]`) |

## Enumerated Values

### journal_style

```ts
type JournalStyle =
  | "nature"
  | "science"
  | "cell"
  | "nejm"
  | "lancet"
  | "general"
```

### chart_type

```ts
type ChartType =
  | "line"
  | "bar"
  | "scatter"
  | "boxplot"
  | "violin"
  | "heatmap"
  | "area"
  | "stacked_bar"
  | "survival_curve"
  | "volcano_plot"
  | "umap"
  | "pca"
```

### use_case

```ts
type UseCase =
  | "publication"
  | "presentation"
  | "thesis"
  | "poster"
  | "multi_group_comparison"
  | "control_vs_treatment"
  | "time_series"
  | "omics"
  | "clinical"
```

### avoid_case

```ts
type AvoidCase =
  | "too_many_groups"
  | "small_print"
  | "grayscale_print"
  | "colorblind_sensitive"
  | "heatmap"
  | "continuous_variable"
  | "dark_background"
  | "low_contrast_required"
```

### discipline

```ts
type Discipline =
  | "biomedical"
  | "clinical"
  | "genomics"
  | "single_cell"
  | "neuroscience"
  | "immunology"
  | "oncology"
  | "AI"
  | "machine_learning"
  | "statistics"
  | "engineering"
  | "chemistry"
  | "materials_science"
  | "environmental_science"
  | "general"
```

### tags

```ts
type Tag =
  | "muted"
  | "pastel"
  | "high_contrast"
  | "low_saturation"
  | "publication_ready"
  | "presentation_friendly"
  | "colorblind_friendly"
  | "clean"
  | "soft"
  | "vivid"
  | "minimal"
  | "professional"
  | "warm"
  | "cool"
```

## JSON Example

```json
{
  "id": "pal_001",
  "name": "Nature Biomedical Muted Five",
  "slug": "nature-biomedical-muted-five",
  "colors": [
    {
      "hex": "#4E79A7",
      "rgb": [78, 121, 167]
    },
    {
      "hex": "#F28E2B",
      "rgb": [242, 142, 43]
    },
    {
      "hex": "#59A14F",
      "rgb": [89, 161, 79]
    },
    {
      "hex": "#E15759",
      "rgb": [225, 87, 89]
    },
    {
      "hex": "#B07AA1",
      "rgb": [176, 122, 161]
    }
  ],
  "journal_style": ["nature"],
  "chart_type": ["line", "bar", "scatter", "boxplot"],
  "color_count": 5,
  "use_case": ["publication", "thesis", "multi_group_comparison"],
  "avoid_case": ["too_many_groups", "continuous_variable", "dark_background"],
  "discipline": ["biomedical", "clinical", "genomics"],
  "tags": ["muted", "low_saturation", "publication_ready", "clean"],
  "created_at": "2026-05-11T00:00:00Z",
  "updated_at": "2026-05-11T00:00:00Z"
}
```

## Filter Fields

```ts
type PaletteFilters = {
  journal_style?: string[]
  chart_type?: string[]
  color_count?: number[]
  use_case?: string[]
  discipline?: string[]
  tags?: string[]
}
```

| Filter | Examples |
|--------|----------|
| Journal Style | Nature / Science / Cell |
| Chart Type | Line / Bar / Scatter / Heatmap / UMAP |
| Color Count | 2 / 3 / 4 / 5 / 6 / 8 / 10 |
| Use Case | Publication / Presentation / Thesis / Poster |
| Discipline | Biomedical / AI / Clinical / Genomics |
| Tags | Muted / Pastel / High Contrast / Colorblind Friendly |
