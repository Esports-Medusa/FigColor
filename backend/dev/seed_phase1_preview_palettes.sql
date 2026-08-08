-- Local/dev Phase 1 scientific preview palette seed.
-- Creates 40 published palettes with one published primary preview each:
-- 10 bar_error, 10 boxplot_jitter, 10 line_multiseries, 10 heatmap_annotated.
--
-- Safe to re-run. This is intentionally a dev seed, not a production migration.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH chart_specs(chart_type, template_id, palette_type, broad_chart_types, name_prefix, family_note, chart_order) AS (
    VALUES
        ('bar_error', 'bar_error_v1', 'categorical', ARRAY['bar'], 'Phase 1 Bar Error Mock', 'Control/treatment bars with error bars', 1),
        ('boxplot_jitter', 'boxplot_jitter_v1', 'categorical', ARRAY['boxplot', 'violin'], 'Phase 1 Boxplot Jitter Mock', 'Group comparison and clinical statistics', 2),
        ('line_multiseries', 'line_multiseries_v1', 'categorical', ARRAY['line'], 'Phase 1 Line Multiseries Mock', 'Time series and dose response', 3),
        ('heatmap_annotated', 'heatmap_annotated_v1', 'heatmap', ARRAY['heatmap'], 'Phase 1 Heatmap Annotated Mock', 'Annotated heatmap or expression matrix', 4)
),
base_colors(hexes) AS (
    VALUES (ARRAY[
        '#2458A6', '#D55E00', '#009E73', '#7B3294', '#E69F00',
        '#56B4E9', '#CC79A7', '#4A90A4', '#9C755F', '#59A14F',
        '#EDC948', '#B07AA1', '#FF9DA7', '#76B7B2', '#F28E2B',
        '#E15759', '#8CD17D', '#499894', '#FABFD2', '#86BCB6'
    ]::TEXT[])
),
generated AS (
    SELECT
        format('phase1-%s-mock-%s', replace(spec.chart_type, '_', '-'), lpad(series.n::TEXT, 2, '0')) AS slug,
        format('%s %s', spec.name_prefix, lpad(series.n::TEXT, 2, '0')) AS name,
        spec.chart_type,
        spec.template_id,
        spec.palette_type,
        spec.broad_chart_types,
        spec.family_note,
        spec.chart_order,
        series.n AS sample_index,
        ARRAY[
            base.hexes[((spec.chart_order * 3 + series.n + 0) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 3 + series.n + 3) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 3 + series.n + 6) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 3 + series.n + 9) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 3 + series.n + 12) % array_length(base.hexes, 1)) + 1]
        ] AS selected_hexes
    FROM chart_specs spec
    CROSS JOIN generate_series(1, 10) AS series(n)
    CROSS JOIN base_colors base
),
palette_rows AS (
    SELECT
        generated.slug,
        generated.name,
        generated.chart_type,
        generated.template_id,
        generated.palette_type,
        generated.broad_chart_types,
        generated.family_note,
        generated.sample_index,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', generated.slug || '-color-' || color.ordinality,
                    'hex', upper(color.hex),
                    'rgb', jsonb_build_array(
                        get_byte(decode(substr(color.hex, 2), 'hex'), 0),
                        get_byte(decode(substr(color.hex, 2), 'hex'), 1),
                        get_byte(decode(substr(color.hex, 2), 'hex'), 2)
                    ),
                    'label', 'Mock color ' || color.ordinality,
                    'order', color.ordinality - 1
                )
                ORDER BY color.ordinality
            )
            FROM unnest(generated.selected_hexes) WITH ORDINALITY AS color(hex, ordinality)
        ) AS colors,
        jsonb_build_array(
            jsonb_build_object(
                'chart_type', generated.chart_type,
                'suitability', 'best_fit',
                'source', 'curated',
                'notes', generated.family_note
            )
        ) AS chart_applicability
    FROM generated
),
upserted_palettes AS (
    INSERT INTO palettes (
        slug,
        name,
        visibility,
        origin,
        colors,
        color_count,
        type,
        chart_types,
        chart_applicability,
        journal_style,
        discipline,
        use_case,
        avoid_case,
        tags,
        accessibility,
        source_type,
        source_image,
        source_note,
        status,
        version,
        created_at,
        updated_at,
        published_at
    )
    SELECT
        slug,
        name,
        'public',
        'curated',
        colors,
        5,
        palette_type,
        broad_chart_types,
        chart_applicability,
        ARRAY[
            CASE WHEN sample_index % 3 = 0 THEN 'science' WHEN sample_index % 3 = 1 THEN 'nature' ELSE 'cell' END,
            'general'
        ],
        ARRAY[
            CASE chart_type
                WHEN 'bar_error' THEN 'biomedical'
                WHEN 'boxplot_jitter' THEN 'clinical'
                WHEN 'line_multiseries' THEN 'pharmacology'
                ELSE 'genomics'
            END,
            'statistics'
        ],
        ARRAY[
            CASE chart_type
                WHEN 'bar_error' THEN 'control_vs_treatment'
                WHEN 'boxplot_jitter' THEN 'multi_group_comparison'
                WHEN 'line_multiseries' THEN 'time_series'
                ELSE 'omics'
            END,
            'publication'
        ],
        ARRAY['dark_background'],
        ARRAY['phase1_mock', chart_type, 'publication_ready'],
        jsonb_build_object('colorblind_safe', sample_index % 2 = 0, 'print_friendly', true, 'dark_background', false),
        'curated',
        NULL,
        'Local Phase 1 scientific preview seed data for renderer and export acceptance checks.',
        'published',
        'phase1-dev-seed-v1',
        NOW(),
        NOW(),
        NOW()
    FROM palette_rows
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        visibility = EXCLUDED.visibility,
        origin = EXCLUDED.origin,
        colors = EXCLUDED.colors,
        color_count = EXCLUDED.color_count,
        type = EXCLUDED.type,
        chart_types = EXCLUDED.chart_types,
        chart_applicability = EXCLUDED.chart_applicability,
        journal_style = EXCLUDED.journal_style,
        discipline = EXCLUDED.discipline,
        use_case = EXCLUDED.use_case,
        avoid_case = EXCLUDED.avoid_case,
        tags = EXCLUDED.tags,
        accessibility = EXCLUDED.accessibility,
        source_type = EXCLUDED.source_type,
        source_image = EXCLUDED.source_image,
        source_note = EXCLUDED.source_note,
        status = EXCLUDED.status,
        version = EXCLUDED.version,
        updated_at = NOW(),
        published_at = COALESCE(palettes.published_at, NOW()),
        archived_at = NULL
    RETURNING id, slug
),
preview_rows AS (
    SELECT
        upserted_palettes.id AS palette_id,
        palette_rows.slug,
        palette_rows.chart_type,
        palette_rows.template_id,
        palette_rows.sample_index,
        CASE palette_rows.chart_type
            WHEN 'bar_error' THEN jsonb_build_object(
                'groups', jsonb_build_array(
                    jsonb_build_object('key', 'control', 'label', 'Control', 'fill', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-1')),
                    jsonb_build_object('key', 'treated', 'label', 'Treated', 'fill', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-2')),
                    jsonb_build_object('key', 'rescue', 'label', 'Rescue', 'fill', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-3')),
                    jsonb_build_object('key', 'washout', 'label', 'Washout', 'fill', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-4')),
                    jsonb_build_object('key', 'follow_up', 'label', 'Follow-up', 'fill', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-5'))
                ),
                'elements', jsonb_build_object(
                    'axis', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'grid', jsonb_build_object('source', 'theme', 'token', 'grid'),
                    'text', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'error_bar', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'background', jsonb_build_object('source', 'theme', 'token', 'background')
                )
            )
            WHEN 'boxplot_jitter' THEN jsonb_build_object(
                'groups', jsonb_build_array(
                    jsonb_build_object('key', 'baseline', 'label', 'Baseline', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-1')),
                    jsonb_build_object('key', 'treatment_a', 'label', 'Treatment A', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-2')),
                    jsonb_build_object('key', 'treatment_b', 'label', 'Treatment B', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-3')),
                    jsonb_build_object('key', 'follow_up', 'label', 'Follow-up', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-4')),
                    jsonb_build_object('key', 'recovery', 'label', 'Recovery', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-5'))
                ),
                'elements', jsonb_build_object(
                    'axis', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'grid', jsonb_build_object('source', 'theme', 'token', 'grid'),
                    'text', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'jitter_point', jsonb_build_object('source', 'theme', 'token', 'muted_foreground', 'opacity', 0.76),
                    'median_line', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'background', jsonb_build_object('source', 'theme', 'token', 'background')
                )
            )
            WHEN 'line_multiseries' THEN jsonb_build_object(
                'series', jsonb_build_array(
                    jsonb_build_object('key', 'baseline', 'label', 'Baseline', 'line', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-1'), 'confidence_band', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-3', 'opacity', 0.22)),
                    jsonb_build_object('key', 'dose_low', 'label', 'Low dose', 'line', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-2'), 'marker', jsonb_build_object('source', 'theme', 'token', 'background')),
                    jsonb_build_object('key', 'dose_high', 'label', 'High dose', 'line', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-3')),
                    jsonb_build_object('key', 'washout', 'label', 'Washout', 'line', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-4')),
                    jsonb_build_object('key', 'follow_up', 'label', 'Follow-up', 'line', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-5'))
                ),
                'elements', jsonb_build_object(
                    'axis', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'grid', jsonb_build_object('source', 'theme', 'token', 'grid'),
                    'reference_line', jsonb_build_object('source', 'theme', 'token', 'muted_foreground', 'opacity', 0.65),
                    'text', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'marker_stroke', jsonb_build_object('source', 'theme', 'token', 'background'),
                    'background', jsonb_build_object('source', 'theme', 'token', 'background')
                )
            )
            ELSE jsonb_build_object(
                'scale', jsonb_build_object(
                    'type', CASE WHEN sample_index % 2 = 0 THEN 'diverging' ELSE 'sequential' END,
                    'stops', CASE WHEN sample_index % 2 = 0 THEN jsonb_build_array(
                        jsonb_build_object('position', 0, 'label', 'Low', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-1')),
                        jsonb_build_object('position', 0.5, 'label', 'Mid', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-3')),
                        jsonb_build_object('position', 1, 'label', 'High', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-5'))
                    ) ELSE jsonb_build_array(
                        jsonb_build_object('position', 0, 'label', 'Low', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-1')),
                        jsonb_build_object('position', 0.5, 'label', 'Mid', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-3')),
                        jsonb_build_object('position', 1, 'label', 'High', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-5'))
                    ) END
                ),
                'annotations', jsonb_build_array(
                    jsonb_build_object('key', 'cohort_a', 'label', 'Cohort A', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-2')),
                    jsonb_build_object('key', 'cohort_b', 'label', 'Cohort B', 'color', jsonb_build_object('source', 'palette', 'color_id', palette_rows.slug || '-color-4'))
                ),
                'elements', jsonb_build_object(
                    'missing_value', jsonb_build_object('source', 'theme', 'token', 'muted_foreground', 'opacity', 0.35),
                    'text', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'border', jsonb_build_object('source', 'theme', 'token', 'foreground', 'opacity', 0.42),
                    'grid', jsonb_build_object('source', 'theme', 'token', 'grid'),
                    'background', jsonb_build_object('source', 'theme', 'token', 'background'),
                    'annotation_text', jsonb_build_object('source', 'theme', 'token', 'foreground')
                )
            )
        END AS color_roles,
        CASE palette_rows.chart_type
            WHEN 'bar_error' THEN jsonb_build_object(
                'orientation', CASE WHEN palette_rows.sample_index % 2 = 0 THEN 'horizontal' ELSE 'vertical' END,
                'sample_size', 18 + palette_rows.sample_index,
                'error_type', CASE WHEN palette_rows.sample_index % 3 = 0 THEN 'sd' WHEN palette_rows.sample_index % 3 = 1 THEN 'sem' ELSE 'ci' END,
                'data_pattern', CASE WHEN palette_rows.sample_index % 4 = 0 THEN 'dose_response' WHEN palette_rows.sample_index % 4 = 1 THEN 'treatment_higher' WHEN palette_rows.sample_index % 4 = 2 THEN 'treatment_lower' ELSE 'mixed' END
            )
            WHEN 'boxplot_jitter' THEN jsonb_build_object(
                'jitter_density', CASE WHEN palette_rows.sample_index % 3 = 0 THEN 'low' WHEN palette_rows.sample_index % 3 = 1 THEN 'medium' ELSE 'high' END,
                'show_outliers', palette_rows.sample_index % 2 = 0,
                'y_axis_label', 'Measurement'
            )
            WHEN 'line_multiseries' THEN jsonb_build_object(
                'point_count', 6 + (palette_rows.sample_index % 7),
                'curve_shape', CASE WHEN palette_rows.sample_index % 5 = 0 THEN 'increasing' WHEN palette_rows.sample_index % 5 = 1 THEN 'decreasing' WHEN palette_rows.sample_index % 5 = 2 THEN 'sigmoid' WHEN palette_rows.sample_index % 5 = 3 THEN 'peak' ELSE 'mixed' END,
                'x_axis_label', 'Time',
                'y_axis_label', 'Response'
            )
            ELSE jsonb_build_object(
                'rows', 4 + (palette_rows.sample_index % 5),
                'columns', 4 + ((palette_rows.sample_index + 2) % 5),
                'cluster_rows', palette_rows.sample_index % 2 = 0,
                'cluster_columns', palette_rows.sample_index % 3 = 0,
                'show_row_labels', true,
                'show_column_labels', true,
                'show_values', palette_rows.sample_index % 2 = 1,
                'data_pattern', CASE WHEN palette_rows.sample_index % 4 = 0 THEN 'two_clusters' WHEN palette_rows.sample_index % 4 = 1 THEN 'three_clusters' WHEN palette_rows.sample_index % 4 = 2 THEN 'gradient' ELSE 'mixed' END
            )
        END AS preview_config
    FROM palette_rows
    JOIN upserted_palettes USING (slug)
)
INSERT INTO palette_preview_cases (
    id,
    palette_id,
    chart_type,
    template_id,
    template_version,
    schema_version,
    color_roles,
    preview_config,
    seed_strategy,
    seed_value,
    is_primary,
    status,
    created_at,
    updated_at
)
SELECT
    (
        substr(md5(slug || '-primary-preview'), 1, 8) || '-' ||
        substr(md5(slug || '-primary-preview'), 9, 4) || '-' ||
        substr(md5(slug || '-primary-preview'), 13, 4) || '-' ||
        substr(md5(slug || '-primary-preview'), 17, 4) || '-' ||
        substr(md5(slug || '-primary-preview'), 21, 12)
    )::UUID,
    palette_id,
    chart_type,
    template_id,
    1,
    1,
    color_roles,
    preview_config,
    'stable_id',
    NULL,
    TRUE,
    'published',
    NOW(),
    NOW()
FROM preview_rows
ON CONFLICT (palette_id, chart_type, template_id, template_version)
WHERE status <> 'archived'
DO UPDATE SET
    color_roles = EXCLUDED.color_roles,
    preview_config = EXCLUDED.preview_config,
    seed_strategy = EXCLUDED.seed_strategy,
    seed_value = EXCLUDED.seed_value,
    is_primary = TRUE,
    status = 'published',
    updated_at = NOW();

COMMIT;

SELECT
    ppc.chart_type,
    count(*) AS primary_preview_count
FROM palettes p
JOIN palette_preview_cases ppc ON ppc.palette_id = p.id
WHERE p.slug LIKE 'phase1-%-mock-%'
  AND p.status = 'published'
  AND ppc.status = 'published'
  AND ppc.is_primary = TRUE
GROUP BY ppc.chart_type
ORDER BY ppc.chart_type;
