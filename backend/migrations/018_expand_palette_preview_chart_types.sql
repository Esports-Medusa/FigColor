BEGIN;

ALTER TABLE palette_preview_cases
    DROP CONSTRAINT chk_palette_preview_cases_chart_type;

ALTER TABLE palette_preview_cases
    ADD CONSTRAINT chk_palette_preview_cases_chart_type
    CHECK (
        chart_type IN (
            'bar_error',
            'boxplot_jitter',
            'line_multiseries',
            'heatmap_annotated',
            'scatter_grouped',
            'violin_distribution'
        )
    );

COMMIT;
