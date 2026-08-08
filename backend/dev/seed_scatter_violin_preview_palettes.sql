-- Local/dev Scatter + Violin scientific preview palette seed.
-- Creates 20 published palettes with one published primary preview each:
-- 10 scatter_grouped and 10 violin_distribution.
--
-- Safe to re-run. This is intentionally dev/debug data, not a migration.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH chart_specs(chart_type, template_id, broad_chart_types, name_prefix, family_note, chart_order) AS (
    VALUES
        ('scatter_grouped', 'scatter_grouped_v1', ARRAY['scatter'], 'Scatter Grouped Mock', 'Grouped experimental classes in two-dimensional scientific data', 1),
        ('violin_distribution', 'violin_distribution_v1', ARRAY['violin'], 'Violin Distribution Mock', 'Experimental-group distribution comparison', 2)
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
        format('preview-%s-mock-%s', replace(spec.chart_type, '_', '-'), lpad(series.n::TEXT, 2, '0')) AS slug,
        format('%s %s', spec.name_prefix, lpad(series.n::TEXT, 2, '0')) AS name,
        spec.chart_type,
        spec.template_id,
        spec.broad_chart_types,
        spec.family_note,
        series.n AS sample_index,
        5 AS group_count,
        ARRAY[
            base.hexes[((spec.chart_order * 5 + series.n + 0) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 5 + series.n + 4) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 5 + series.n + 8) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 5 + series.n + 12) % array_length(base.hexes, 1)) + 1],
            base.hexes[((spec.chart_order * 5 + series.n + 16) % array_length(base.hexes, 1)) + 1]
        ] AS selected_hexes
    FROM chart_specs spec
    CROSS JOIN generate_series(1, 10) AS series(n)
    CROSS JOIN base_colors base
),
palette_rows AS (
    SELECT
        generated.*,
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
        'categorical',
        broad_chart_types,
        chart_applicability,
        ARRAY[
            CASE WHEN sample_index % 3 = 0 THEN 'science' WHEN sample_index % 3 = 1 THEN 'nature' ELSE 'cell' END,
            'general'
        ],
        ARRAY[
            CASE chart_type WHEN 'scatter_grouped' THEN 'statistics' ELSE 'clinical' END,
            'biomedical'
        ],
        ARRAY['multi_group_comparison', 'publication'],
        ARRAY['dark_background'],
        ARRAY['preview_mock', chart_type, 'publication_ready'],
        jsonb_build_object(
            'colorblind_safe', sample_index % 2 = 0,
            'print_friendly', true,
            'dark_background', false
        ),
        'curated',
        NULL,
        'Local Scatter/Violin scientific preview seed data for renderer and preview upgrade debugging.',
        'published',
        'scatter-violin-dev-seed-v1',
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
        palette_rows.group_count,
        CASE palette_rows.chart_type
            WHEN 'scatter_grouped' THEN jsonb_build_object(
                'groups', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'key', 'group_' || group_index,
                            'label', 'Group ' || group_index,
                            'color', jsonb_build_object(
                                'source', 'palette',
                                'color_id', palette_rows.slug || '-color-' || group_index
                            )
                        )
                        ORDER BY group_index
                    )
                    FROM generate_series(1, palette_rows.group_count) AS group_index
                ),
                'elements', jsonb_build_object(
                    'axis', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'muted_foreground', jsonb_build_object('source', 'theme', 'token', 'muted_foreground'),
                    'grid', jsonb_build_object('source', 'theme', 'token', 'grid'),
                    'background', jsonb_build_object('source', 'theme', 'token', 'background')
                )
            )
            ELSE jsonb_build_object(
                'groups', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'key', 'distribution_' || group_index,
                            'label', 'Cohort ' || group_index,
                            'fill', jsonb_build_object(
                                'source', 'palette',
                                'color_id', palette_rows.slug || '-color-' || group_index
                            )
                        )
                        ORDER BY group_index
                    )
                    FROM generate_series(1, palette_rows.group_count) AS group_index
                ),
                'elements', jsonb_build_object(
                    'outline', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'median', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'axis', jsonb_build_object('source', 'theme', 'token', 'foreground'),
                    'grid', jsonb_build_object('source', 'theme', 'token', 'grid'),
                    'background', jsonb_build_object('source', 'theme', 'token', 'background')
                )
            )
        END AS color_roles,
        CASE palette_rows.chart_type
            WHEN 'scatter_grouped' THEN jsonb_build_object(
                'point_count', 10 + (palette_rows.sample_index * 2),
                'data_pattern', CASE palette_rows.sample_index % 4
                    WHEN 0 THEN 'clusters'
                    WHEN 1 THEN 'positive'
                    WHEN 2 THEN 'negative'
                    ELSE 'mixed'
                END,
                'point_size', CASE palette_rows.sample_index % 3
                    WHEN 0 THEN 'small'
                    WHEN 1 THEN 'medium'
                    ELSE 'large'
                END,
                'point_opacity', 0.55 + ((palette_rows.sample_index % 4) * 0.1)
            )
            ELSE jsonb_build_object(
                'sample_count', 20 + (palette_rows.sample_index * 2),
                'distribution_shape', CASE palette_rows.sample_index % 4
                    WHEN 0 THEN 'normal'
                    WHEN 1 THEN 'skewed'
                    WHEN 2 THEN 'bimodal'
                    ELSE 'mixed'
                END,
                'bandwidth', CASE palette_rows.sample_index % 3
                    WHEN 0 THEN 'narrow'
                    WHEN 1 THEN 'medium'
                    ELSE 'wide'
                END,
                'show_summary', palette_rows.sample_index % 3 <> 0
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
WHERE p.slug LIKE 'preview-%-mock-%'
  AND p.status = 'published'
  AND ppc.status = 'published'
  AND ppc.is_primary = TRUE
GROUP BY ppc.chart_type
ORDER BY ppc.chart_type;
