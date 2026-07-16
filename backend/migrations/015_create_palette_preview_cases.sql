BEGIN;

CREATE TABLE palette_preview_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    palette_id UUID NOT NULL
        REFERENCES palettes(id)
        ON DELETE CASCADE,

    chart_type VARCHAR(50) NOT NULL,

    template_id VARCHAR(100) NOT NULL,
    template_version INTEGER NOT NULL DEFAULT 1,
    schema_version INTEGER NOT NULL DEFAULT 1,

    color_roles JSONB NOT NULL,
    preview_config JSONB NOT NULL,

    seed_strategy VARCHAR(30)
        NOT NULL DEFAULT 'stable_id',
    seed_value INTEGER,

    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_palette_preview_cases_chart_type
        CHECK (
            chart_type IN (
                'bar_error',
                'boxplot_jitter',
                'line_multiseries',
                'heatmap_annotated'
            )
        ),

    CONSTRAINT chk_palette_preview_cases_status
        CHECK (
            status IN ('draft', 'published', 'archived')
        ),

    CONSTRAINT chk_palette_preview_cases_seed_strategy
        CHECK (
            seed_strategy IN ('stable_id', 'fixed')
        ),

    CONSTRAINT chk_palette_preview_cases_fixed_seed_value
        CHECK (
            seed_strategy <> 'fixed'
            OR seed_value IS NOT NULL
        ),

    CONSTRAINT chk_palette_preview_cases_primary_published
        CHECK (
            is_primary = FALSE
            OR status = 'published'
        ),

    CONSTRAINT chk_palette_preview_cases_template_version
        CHECK (template_version > 0),

    CONSTRAINT chk_palette_preview_cases_schema_version
        CHECK (schema_version > 0)
);

CREATE INDEX idx_palette_preview_cases_palette_id
ON palette_preview_cases(palette_id);

CREATE INDEX idx_palette_preview_cases_chart_type
ON palette_preview_cases(chart_type);

CREATE INDEX idx_palette_preview_cases_status
ON palette_preview_cases(status);

CREATE UNIQUE INDEX idx_one_primary_preview_per_palette
ON palette_preview_cases(palette_id)
WHERE is_primary = TRUE;

CREATE UNIQUE INDEX idx_unique_active_preview_case
ON palette_preview_cases(
    palette_id,
    chart_type,
    template_id,
    template_version
)
WHERE status <> 'archived';

COMMIT;
