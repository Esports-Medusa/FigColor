// Generated from src/lib/chart-types/registry.ts. Do not edit by hand.
var controlled_vocabularies_default = {
	contract_version: 1,
	palette_types: [
		"categorical",
		"sequential",
		"diverging",
		"mixed"
	],
	chart_types: [
		"bar_error",
		"boxplot_jitter",
		"line_multiseries",
		"heatmap_annotated",
		"scatter_grouped",
		"violin_distribution"
	],
	chart_suitabilities: [
		"best_fit",
		"recommended",
		"compatible",
		"limited"
	],
	disciplines: [
		"biomedical",
		"clinical",
		"genomics",
		"single_cell",
		"neuroscience",
		"immunology",
		"oncology",
		"AI",
		"machine_learning",
		"statistics",
		"engineering",
		"chemistry",
		"materials_science",
		"environmental_science",
		"general"
	],
	use_cases: [
		"publication",
		"presentation",
		"thesis",
		"poster",
		"multi_group_comparison",
		"control_vs_treatment",
		"time_series",
		"omics",
		"clinical"
	],
	avoid_cases: [
		"too_many_groups",
		"small_print",
		"grayscale_print",
		"colorblind_sensitive",
		"heatmap",
		"continuous_variable",
		"dark_background",
		"low_contrast_required"
	],
	tags: [
		"muted",
		"pastel",
		"high_contrast",
		"low_saturation",
		"publication_ready",
		"presentation_friendly",
		"colorblind_friendly",
		"clean",
		"soft",
		"vivid",
		"minimal",
		"professional",
		"warm",
		"cool"
	],
	preview_templates: {
		"bar_error": "bar_error_v1",
		"boxplot_jitter": "boxplot_jitter_v1",
		"line_multiseries": "line_multiseries_v1",
		"heatmap_annotated": "heatmap_annotated_v1",
		"scatter_grouped": "scatter_grouped_v1",
		"violin_distribution": "violin_distribution_v1"
	},
	runtime_sources: {
		"frontend_metadata": "src/types/palette.ts",
		"frontend_chart_registry": "src/lib/chart-types/registry.ts",
		"backend_palette_and_chart_validation": "backend/internal/palette/validation.go",
		"backend_preview_validation": "backend/internal/palette/preview_case_validation.go"
	},
	known_differences: [
		"The backend does not currently enforce disciplines, use_cases, avoid_cases, or tags against the frontend lists.",
		"Legacy broad chart filter values are not ingestion chart types.",
		"Legacy palette types qualitative and heatmap remain readable but are forbidden for ingestion writes."
	]
};
//#endregion
//#region src/lib/chart-types/types.ts
function validResult() {
	return {
		valid: true,
		issues: []
	};
}
function invalidResult(issues) {
	return {
		valid: false,
		issues
	};
}
function registryIssue(path, code, message) {
	return {
		path,
		code,
		message
	};
}
//#endregion
//#region src/lib/chart-types/validation.ts
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rejectUnknownProperties(value, allowed, path, code) {
	if (!isRecord(value)) return [];
	return Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => registryIssue(`${path}.${key}`, code, `${path}.${key} is not supported.`));
}
function combineIssues(issues) {
	return issues.length > 0 ? invalidResult(issues) : validResult();
}
function validateSchema(value, schema, path, code) {
	return combineIssues(validateSchemaValue(value, schema, path, code));
}
function validateSchemaValue(value, schema, path, code) {
	switch (schema.kind) {
		case "object": {
			if (!isRecord(value)) return [registryIssue(path, code, `${path} must be an object.`)];
			const issues = schema.exact ? rejectUnknownProperties(value, Object.keys(schema.fields), path, code) : [];
			for (const [key, field] of Object.entries(schema.fields)) {
				const childPath = `${path}.${key}`;
				if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === void 0) {
					if (field.required) issues.push(registryIssue(childPath, code, `${childPath} is required.`));
					continue;
				}
				issues.push(...validateSchemaValue(value[key], field.schema, childPath, code));
			}
			for (const rule of schema.rules ?? []) if (rule.kind === "conditional_min_items" && typeof value[rule.discriminatorField] === "string" && Array.isArray(value[rule.arrayField])) {
				const minimum = rule.cases[value[rule.discriminatorField]];
				if (minimum !== void 0 && value[rule.arrayField].length < minimum) issues.push(registryIssue(`${path}.${rule.arrayField}`, code, `${path}.${rule.arrayField} must contain at least ${minimum} items.`));
			}
			return issues;
		}
		case "array": {
			if (!Array.isArray(value)) return [registryIssue(path, code, `${path} must be an array.`)];
			const issues = [];
			if (schema.minItems !== void 0 && value.length < schema.minItems || schema.maxItems !== void 0 && value.length > schema.maxItems) {
				const range = schema.maxItems === void 0 ? `at least ${schema.minItems}` : `${schema.minItems} to ${schema.maxItems}`;
				issues.push(registryIssue(path, code, `${path} must contain ${range} items.`));
			}
			value.forEach((item, index) => issues.push(...validateSchemaValue(item, schema.items, `${path}[${index}]`, code)));
			for (const rule of schema.rules ?? []) issues.push(...validateArrayRule(value, rule, path, code));
			return issues;
		}
		case "string":
			if (typeof value !== "string") return [registryIssue(path, code, `${path} must be a string.`)];
			if (schema.nonWhitespace && value.trim() === "") return [registryIssue(path, code, `${path} must be a non-empty string.`)];
			if (schema.enum && !schema.enum.includes(value)) return [registryIssue(path, code, `${path} must be one of: ${schema.enum.join(", ")}.`)];
			return [];
		case "number":
			if (typeof value !== "number" || !Number.isFinite(value) || schema.integer && !Number.isInteger(value)) return [registryIssue(path, code, `${path} must be ${schema.integer ? "an integer" : "a number"}.`)];
			if (schema.min !== void 0 && value < schema.min) return [registryIssue(path, code, schema.max === void 0 ? `${path} must be at least ${schema.min}.` : `${path} must be between ${schema.min} and ${schema.max}.`)];
			if (schema.max !== void 0 && value > schema.max) return [registryIssue(path, code, schema.min === void 0 ? `${path} must be at most ${schema.max}.` : `${path} must be between ${schema.min} and ${schema.max}.`)];
			return [];
		case "boolean": return typeof value === "boolean" ? [] : [registryIssue(path, code, `${path} must be a boolean.`)];
		case "palette_reference": return validatePaletteReference(value, schema.unknownMembers, path, code);
		case "visual_reference": return validateVisualReference(value, schema.themeTokens, schema.unknownMembers, path, code);
	}
}
function validatePaletteReference(value, unknownMembers, path, code) {
	if (!isRecord(value) || value.source !== "palette" || typeof value.color_id !== "string" || value.color_id.trim() === "") return [registryIssue(path, code, `${path} must be a palette color reference with color_id.`)];
	const issues = unknownMembers === "reject" ? rejectUnknownProperties(value, [
		"source",
		"color_id",
		"opacity"
	], path, code) : [];
	if (!(value.opacity === void 0 || typeof value.opacity === "number" && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1)) issues.push(registryIssue(`${path}.opacity`, code, `${path}.opacity must be between 0 and 1.`));
	return issues;
}
function validateVisualReference(value, tokens, unknownMembers, path, code) {
	if (!isRecord(value)) return [registryIssue(path, code, `${path} must be a color reference.`)];
	if (value.source === "palette") return validatePaletteReference(value, unknownMembers, path, code);
	if (value.source === "theme" && typeof value.token === "string" && tokens.includes(value.token)) {
		const issues = unknownMembers === "reject" ? rejectUnknownProperties(value, [
			"source",
			"token",
			"opacity"
		], path, code) : [];
		if (!(value.opacity === void 0 || typeof value.opacity === "number" && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1)) issues.push(registryIssue(`${path}.opacity`, code, `${path}.opacity must be between 0 and 1.`));
		return issues;
	}
	return [registryIssue(path, code, `${path} must use a palette color or approved theme token.`)];
}
function validateSchemaDeclaration(schema, path = "schema") {
	const errors = [];
	const visit = (node, at) => {
		if (node.kind === "number" && node.min !== void 0 && node.max !== void 0 && node.min > node.max) errors.push(`${at} has min greater than max.`);
		if (node.kind === "array") {
			if (node.minItems !== void 0 && node.minItems < 0) errors.push(`${at}.minItems is invalid.`);
			if (node.maxItems !== void 0 && (node.maxItems < 0 || node.minItems !== void 0 && node.minItems > node.maxItems)) errors.push(`${at}.maxItems is invalid.`);
			visit(node.items, `${at}.items`);
		}
		if (node.kind === "object") Object.entries(node.fields).forEach(([key, field]) => visit(field.schema, `${at}.fields.${key}`));
	};
	visit(schema, path);
	return errors;
}
function validateArrayRule(value, rule, path, code) {
	const issues = [];
	if (rule.kind === "unique_by") {
		const seen = /* @__PURE__ */ new Set();
		value.forEach((item, index) => {
			const candidate = isRecord(item) ? item[rule.field] : void 0;
			if (typeof candidate === "string" || typeof candidate === "number") {
				if (seen.has(candidate)) issues.push(registryIssue(`${path}[${index}].${rule.field}`, rule.issueCode ?? code, `Duplicate ${rule.field}.`));
				seen.add(candidate);
			}
		});
	} else if (rule.kind === "strictly_increasing") for (let index = 1; index < value.length; index += 1) {
		const previous = value[index - 1];
		const current = value[index];
		const a = isRecord(previous) ? previous[rule.field] : void 0;
		const b = isRecord(current) ? current[rule.field] : void 0;
		if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && b <= a) issues.push(registryIssue(`${path}[${index}].${rule.field}`, code, `${path}[${index}].${rule.field} must be greater than the previous value.`));
	}
	return issues;
}
function defineTemplate(definition) {
	return {
		...definition,
		validateRoles: (value) => validateSchema(value, definition.rolesSchema, "color_roles", "INVALID_COLOR_ROLES"),
		validateConfig: (value) => validateSchema(value, definition.configSchema, "preview_config", "INVALID_PREVIEW_CONFIG")
	};
}
//#endregion
//#region src/lib/chart-types/bar-error/definition.ts
var themeTokens = [
	"foreground",
	"muted_foreground",
	"grid",
	"background"
];
var text = () => ({
	kind: "string",
	nonWhitespace: true
});
var visual$5 = () => ({
	kind: "visual_reference",
	themeTokens,
	unknownMembers: "allow"
});
var fields = (entries, required = true) => Object.fromEntries(Object.entries(entries).map(([key, schema]) => [key, {
	required,
	schema
}]));
var barErrorTemplate = defineTemplate({
	id: "bar_error_v1",
	chartType: "bar_error",
	templateVersion: 1,
	schemaVersion: 1,
	rolesSchema: {
		kind: "object",
		exact: true,
		fields: {
			groups: {
				required: true,
				schema: {
					kind: "array",
					minItems: 1,
					maxItems: 10,
					rules: [{
						kind: "unique_by",
						field: "key",
						issueCode: "DUPLICATE_ROLE_KEY"
					}],
					items: {
						kind: "object",
						exact: false,
						fields: fields({
							key: text(),
							label: text(),
							fill: {
								kind: "palette_reference",
								unknownMembers: "allow"
							}
						})
					}
				}
			},
			elements: {
				required: true,
				schema: {
					kind: "object",
					exact: true,
					fields: fields({
						axis: visual$5(),
						grid: visual$5(),
						text: visual$5(),
						error_bar: visual$5(),
						background: visual$5()
					})
				}
			}
		}
	},
	configSchema: {
		kind: "object",
		exact: false,
		fields: fields({
			orientation: {
				kind: "string",
				enum: ["vertical", "horizontal"]
			},
			sample_size: {
				kind: "number",
				integer: true,
				min: 1
			},
			error_type: {
				kind: "string",
				enum: [
					"sd",
					"sem",
					"ci"
				]
			},
			data_pattern: {
				kind: "string",
				enum: [
					"treatment_higher",
					"treatment_lower",
					"dose_response",
					"mixed"
				]
			}
		})
	}
});
//#endregion
//#region src/lib/chart-types/boxplot-jitter/definition.ts
var tokens$1 = [
	"foreground",
	"muted_foreground",
	"grid",
	"background"
];
var visual$4 = () => ({
	kind: "visual_reference",
	themeTokens: tokens$1,
	unknownMembers: "allow"
});
var req$4 = (schema) => ({
	required: true,
	schema
});
var opt$3 = (schema) => ({
	required: false,
	schema
});
var boxplotJitterTemplate = defineTemplate({
	id: "boxplot_jitter_v1",
	chartType: "boxplot_jitter",
	templateVersion: 1,
	schemaVersion: 1,
	rolesSchema: {
		kind: "object",
		exact: true,
		fields: {
			groups: req$4({
				kind: "array",
				minItems: 1,
				maxItems: 10,
				rules: [{
					kind: "unique_by",
					field: "key"
				}],
				items: {
					kind: "object",
					exact: false,
					fields: {
						key: req$4({
							kind: "string",
							nonWhitespace: true
						}),
						label: req$4({
							kind: "string",
							nonWhitespace: true
						}),
						color: req$4({
							kind: "palette_reference",
							unknownMembers: "allow"
						})
					}
				}
			}),
			elements: opt$3({
				kind: "object",
				exact: true,
				fields: Object.fromEntries([
					"jitter_point",
					"median_line",
					"whisker",
					"outline",
					"axis",
					"grid",
					"text",
					"box_stroke",
					"median",
					"jitter",
					"outlier",
					"background"
				].map((key) => [key, opt$3(visual$4())]))
			})
		}
	},
	configSchema: {
		kind: "object",
		exact: false,
		fields: {
			jitter_density: req$4({
				kind: "string",
				enum: [
					"low",
					"medium",
					"high"
				]
			}),
			show_outliers: req$4({ kind: "boolean" }),
			y_axis_label: opt$3({ kind: "string" })
		}
	}
});
//#endregion
//#region src/lib/chart-types/heatmap-annotated/definition.ts
var req$3 = (schema) => ({
	required: true,
	schema
});
var opt$2 = (schema) => ({
	required: false,
	schema
});
var visual$3 = () => ({
	kind: "visual_reference",
	themeTokens: [
		"foreground",
		"muted_foreground",
		"grid",
		"background"
	],
	unknownMembers: "allow"
});
var namedColor = {
	kind: "object",
	exact: false,
	fields: {
		key: req$3({
			kind: "string",
			nonWhitespace: true
		}),
		label: req$3({
			kind: "string",
			nonWhitespace: true
		}),
		color: req$3({
			kind: "palette_reference",
			unknownMembers: "allow"
		})
	}
};
var heatmapAnnotatedTemplate = defineTemplate({
	id: "heatmap_annotated_v1",
	chartType: "heatmap_annotated",
	templateVersion: 1,
	schemaVersion: 1,
	rolesSchema: {
		kind: "object",
		exact: true,
		fields: {
			scale: req$3({
				kind: "object",
				exact: false,
				rules: [{
					kind: "conditional_min_items",
					arrayField: "stops",
					discriminatorField: "type",
					cases: {
						sequential: 2,
						diverging: 3
					}
				}],
				fields: {
					type: req$3({
						kind: "string",
						enum: ["sequential", "diverging"]
					}),
					stops: req$3({
						kind: "array",
						minItems: 1,
						rules: [{
							kind: "strictly_increasing",
							field: "position"
						}],
						items: {
							kind: "object",
							exact: false,
							fields: {
								position: req$3({
									kind: "number",
									min: 0,
									max: 1
								}),
								color: req$3({
									kind: "palette_reference",
									unknownMembers: "allow"
								}),
								label: opt$2({ kind: "string" })
							}
						}
					})
				}
			}),
			elements: opt$2({
				kind: "object",
				exact: true,
				fields: Object.fromEntries([
					"missing_value",
					"text",
					"border",
					"grid",
					"background",
					"annotation_text"
				].map((k) => [k, opt$2(visual$3())]))
			}),
			annotations: opt$2({
				kind: "array",
				rules: [{
					kind: "unique_by",
					field: "key"
				}],
				items: namedColor
			})
		}
	},
	configSchema: {
		kind: "object",
		exact: false,
		fields: {
			rows: req$3({
				kind: "number",
				integer: true,
				min: 4,
				max: 8
			}),
			columns: req$3({
				kind: "number",
				integer: true,
				min: 4,
				max: 8
			}),
			cluster_rows: req$3({ kind: "boolean" }),
			cluster_columns: req$3({ kind: "boolean" }),
			show_row_labels: req$3({ kind: "boolean" }),
			show_column_labels: req$3({ kind: "boolean" }),
			show_values: req$3({ kind: "boolean" }),
			data_pattern: req$3({
				kind: "string",
				enum: [
					"two_clusters",
					"three_clusters",
					"gradient",
					"mixed"
				]
			})
		}
	}
});
//#endregion
//#region src/lib/chart-types/line-multiseries/definition.ts
var tokens = [
	"foreground",
	"muted_foreground",
	"grid",
	"background"
];
var req$2 = (schema) => ({
	required: true,
	schema
});
var opt$1 = (schema) => ({
	required: false,
	schema
});
var visual$2 = () => ({
	kind: "visual_reference",
	themeTokens: tokens,
	unknownMembers: "allow"
});
var lineMultiseriesTemplate = defineTemplate({
	id: "line_multiseries_v1",
	chartType: "line_multiseries",
	templateVersion: 1,
	schemaVersion: 1,
	rolesSchema: {
		kind: "object",
		exact: true,
		fields: {
			series: req$2({
				kind: "array",
				minItems: 1,
				maxItems: 10,
				rules: [{
					kind: "unique_by",
					field: "key"
				}],
				items: {
					kind: "object",
					exact: false,
					fields: {
						key: req$2({
							kind: "string",
							nonWhitespace: true
						}),
						label: req$2({
							kind: "string",
							nonWhitespace: true
						}),
						line: req$2({
							kind: "palette_reference",
							unknownMembers: "allow"
						}),
						confidence_band: opt$1(visual$2()),
						marker: opt$1(visual$2())
					}
				}
			}),
			elements: opt$1({
				kind: "object",
				exact: true,
				fields: Object.fromEntries([
					"axis",
					"grid",
					"reference_line",
					"text",
					"marker_stroke",
					"background"
				].map((key) => [key, opt$1(visual$2())]))
			})
		}
	},
	configSchema: {
		kind: "object",
		exact: false,
		fields: {
			point_count: req$2({
				kind: "number",
				integer: true,
				min: 6,
				max: 12
			}),
			curve_shape: req$2({
				kind: "string",
				enum: [
					"increasing",
					"decreasing",
					"sigmoid",
					"peak",
					"mixed"
				]
			}),
			x_axis_label: opt$1({ kind: "string" }),
			y_axis_label: opt$1({ kind: "string" })
		}
	}
});
//#endregion
//#region src/lib/chart-types/scatter-grouped/definition.ts
var req$1 = (schema) => ({
	required: true,
	schema
});
var opt = (schema) => ({
	required: false,
	schema
});
var visual$1 = () => ({
	kind: "visual_reference",
	themeTokens: [
		"foreground",
		"muted_foreground",
		"grid",
		"background"
	],
	unknownMembers: "allow"
});
var scatterGroupedTemplate = defineTemplate({
	id: "scatter_grouped_v1",
	chartType: "scatter_grouped",
	templateVersion: 1,
	schemaVersion: 1,
	rolesSchema: {
		kind: "object",
		exact: true,
		fields: {
			groups: req$1({
				kind: "array",
				minItems: 1,
				maxItems: 10,
				rules: [{
					kind: "unique_by",
					field: "key",
					issueCode: "DUPLICATE_ROLE_KEY"
				}],
				items: {
					kind: "object",
					exact: false,
					fields: {
						key: req$1({
							kind: "string",
							nonWhitespace: true
						}),
						label: req$1({
							kind: "string",
							nonWhitespace: true
						}),
						color: req$1({
							kind: "palette_reference",
							unknownMembers: "allow"
						})
					}
				}
			}),
			elements: req$1({
				kind: "object",
				exact: true,
				fields: Object.fromEntries([
					"axis",
					"muted_foreground",
					"grid",
					"background"
				].map((k) => [k, req$1(visual$1())]))
			})
		}
	},
	configSchema: {
		kind: "object",
		exact: false,
		fields: {
			point_count: req$1({
				kind: "number",
				integer: true,
				min: 8,
				max: 30
			}),
			data_pattern: req$1({
				kind: "string",
				enum: [
					"clusters",
					"positive",
					"negative",
					"mixed"
				]
			}),
			point_size: req$1({
				kind: "string",
				enum: [
					"small",
					"medium",
					"large"
				]
			}),
			point_opacity: opt({
				kind: "number",
				min: .25,
				max: 1
			})
		}
	}
});
//#endregion
//#region src/lib/chart-types/violin-distribution/definition.ts
var req = (schema) => ({
	required: true,
	schema
});
var visual = () => ({
	kind: "visual_reference",
	themeTokens: [
		"foreground",
		"muted_foreground",
		"grid",
		"background"
	],
	unknownMembers: "allow"
});
var violinDistributionTemplate = defineTemplate({
	id: "violin_distribution_v1",
	chartType: "violin_distribution",
	templateVersion: 1,
	schemaVersion: 1,
	rolesSchema: {
		kind: "object",
		exact: true,
		fields: {
			groups: req({
				kind: "array",
				minItems: 1,
				maxItems: 10,
				rules: [{
					kind: "unique_by",
					field: "key"
				}],
				items: {
					kind: "object",
					exact: false,
					fields: {
						key: req({
							kind: "string",
							nonWhitespace: true
						}),
						label: req({
							kind: "string",
							nonWhitespace: true
						}),
						fill: req({
							kind: "palette_reference",
							unknownMembers: "allow"
						})
					}
				}
			}),
			elements: req({
				kind: "object",
				exact: true,
				fields: Object.fromEntries([
					"outline",
					"median",
					"axis",
					"grid",
					"background"
				].map((k) => [k, req(visual())]))
			})
		}
	},
	configSchema: {
		kind: "object",
		exact: false,
		fields: {
			sample_count: req({
				kind: "number",
				integer: true,
				min: 16,
				max: 48
			}),
			distribution_shape: req({
				kind: "string",
				enum: [
					"normal",
					"skewed",
					"bimodal",
					"mixed"
				]
			}),
			bandwidth: req({
				kind: "string",
				enum: [
					"narrow",
					"medium",
					"wide"
				]
			}),
			show_summary: req({ kind: "boolean" })
		}
	}
});
//#endregion
//#region src/lib/chart-types/registry.ts
var CHART_TYPE_DEFINITIONS = registerChartTypes([
	{
		chartType: "bar_error",
		templates: [barErrorTemplate]
	},
	{
		chartType: "boxplot_jitter",
		templates: [boxplotJitterTemplate]
	},
	{
		chartType: "line_multiseries",
		templates: [lineMultiseriesTemplate]
	},
	{
		chartType: "heatmap_annotated",
		templates: [heatmapAnnotatedTemplate]
	},
	{
		chartType: "scatter_grouped",
		templates: [scatterGroupedTemplate]
	},
	{
		chartType: "violin_distribution",
		templates: [violinDistributionTemplate]
	}
]);
var PREVIEW_REGISTRY_PROJECTION_FORMAT_VERSION = 1;
function createPreviewRegistryProjection() {
	for (const chart of CHART_TYPE_DEFINITIONS) for (const template of chart.templates) {
		const errors = [...validateSchemaDeclaration(template.rolesSchema, `${template.id}.roles`), ...validateSchemaDeclaration(template.configSchema, `${template.id}.config`)];
		if (errors.length > 0) throw new Error(`Invalid structured Preview schema: ${errors.join(" ")}`);
	}
	return {
		projection_format_version: 1,
		charts: CHART_TYPE_DEFINITIONS.map((chart) => ({
			chart_type: chart.chartType,
			templates: chart.templates.map((template) => ({
				template_id: template.id,
				template_version: template.templateVersion,
				schema_version: template.schemaVersion,
				roles_schema: template.rolesSchema,
				config_schema: template.configSchema
			}))
		})),
		vocabularies: {
			disciplines: [...controlled_vocabularies_default.disciplines],
			use_cases: [...controlled_vocabularies_default.use_cases],
			avoid_cases: [...controlled_vocabularies_default.avoid_cases],
			tags: [...controlled_vocabularies_default.tags]
		}
	};
}
function getChartTypeDefinition(chartType) {
	return CHART_TYPE_DEFINITIONS.find((definition) => definition.chartType === chartType);
}
function getChartTemplateDefinition(chartType, templateId) {
	return getChartTypeDefinition(chartType)?.templates.find((template) => template.id === templateId);
}
function lookupChartTemplateDefinition(chartType, templateId) {
	const chartDefinition = getChartTypeDefinition(chartType);
	if (!chartDefinition) return {
		ok: false,
		issues: [registryIssue("chart_type", "UNSUPPORTED_CHART_TYPE", `Unsupported chart type: ${chartType}.`)]
	};
	const template = chartDefinition.templates.find((candidate) => candidate.id === templateId);
	if (template) return {
		ok: true,
		template
	};
	const owningTemplate = findTemplateById(templateId);
	return {
		ok: false,
		issues: [owningTemplate ? registryIssue("template_id", "TEMPLATE_CHART_TYPE_MISMATCH", `Template ${templateId} belongs to ${owningTemplate.chartType}, not ${chartType}.`) : registryIssue("template_id", "UNKNOWN_TEMPLATE_ID", `Unknown template ID: ${templateId}.`)]
	};
}
function validatePreviewTemplateReference(previewCase) {
	const lookup = lookupChartTemplateDefinition(previewCase.chart_type, previewCase.template_id);
	if (!lookup.ok) return invalidResult(lookup.issues);
	const issues = [];
	if (previewCase.template_version !== lookup.template.templateVersion) issues.push(registryIssue("template_version", "UNSUPPORTED_TEMPLATE_VERSION", `Unsupported template version ${previewCase.template_version} for ${previewCase.template_id}.`));
	if (previewCase.schema_version !== lookup.template.schemaVersion) issues.push(registryIssue("schema_version", "UNSUPPORTED_SCHEMA_VERSION", `Unsupported schema version ${previewCase.schema_version} for ${previewCase.template_id}.`));
	return issues.length > 0 ? invalidResult(issues) : validResult();
}
function validatePreviewCaseAgainstRegistry(previewCase) {
	const referenceResult = validatePreviewTemplateReference(previewCase);
	if (!referenceResult.valid) return referenceResult;
	const template = getChartTemplateDefinition(previewCase.chart_type, previewCase.template_id);
	if (!template) return invalidResult([registryIssue("template_id", "UNKNOWN_TEMPLATE_ID", `Unknown template ID: ${previewCase.template_id}.`)]);
	return mergeValidationResults([template.validateRoles(previewCase.color_roles), template.validateConfig(previewCase.preview_config)]);
}
function registerChartTypes(definitions) {
	const chartTypes = /* @__PURE__ */ new Set();
	const templateIds = /* @__PURE__ */ new Set();
	definitions.forEach((definition) => {
		if (chartTypes.has(definition.chartType)) throw new Error(`Duplicate chart type registration: ${definition.chartType}`);
		chartTypes.add(definition.chartType);
		definition.templates.forEach((template) => {
			if (template.chartType !== definition.chartType) throw new Error(`Template ${template.id} has chart type ${template.chartType}, expected ${definition.chartType}`);
			if (templateIds.has(template.id)) throw new Error(`Duplicate template registration: ${template.id}`);
			templateIds.add(template.id);
		});
	});
	return definitions;
}
function findTemplateById(templateId) {
	return CHART_TYPE_DEFINITIONS.flatMap((definition) => definition.templates).find((template) => template.id === templateId);
}
function mergeValidationResults(results) {
	const issues = results.flatMap((result) => result.issues);
	return issues.length > 0 ? invalidResult(issues) : validResult();
}
//#endregion
export { CHART_TYPE_DEFINITIONS, PREVIEW_REGISTRY_PROJECTION_FORMAT_VERSION, createPreviewRegistryProjection, getChartTemplateDefinition, getChartTypeDefinition, lookupChartTemplateDefinition, registerChartTypes, validatePreviewCaseAgainstRegistry, validatePreviewTemplateReference };
