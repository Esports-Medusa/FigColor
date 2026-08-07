// Generated from src/lib/chart-types/registry.ts. Do not edit by hand.
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
function validateObject(value, path, code) {
	return isRecord(value) ? validResult() : invalidResult([registryIssue(path, code, `${path} must be an object.`)]);
}
function requireObjectProperty(value, key, path, code) {
	return isRecord(value[key]) ? [] : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be an object.`)];
}
function requireArrayProperty(value, key, path, code) {
	return Array.isArray(value[key]) ? [] : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be an array.`)];
}
function requirePrimitiveProperty(value, key, kind, path, code) {
	return typeof value[key] === kind ? [] : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be a ${kind}.`)];
}
function requirePositiveIntegerProperty(value, key, path, code) {
	return Number.isInteger(value[key]) && Number(value[key]) > 0 ? [] : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be a positive integer.`)];
}
function requireEnumProperty(value, key, allowed, path, code) {
	return typeof value[key] === "string" && allowed.includes(value[key]) ? [] : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be one of: ${allowed.join(", ")}.`)];
}
function rejectUnknownProperties(value, allowed, path, code) {
	if (!isRecord(value)) return [];
	return Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => registryIssue(`${path}.${key}`, code, `${path}.${key} is not supported.`));
}
function combineIssues(issues) {
	return issues.length > 0 ? invalidResult(issues) : validResult();
}
//#endregion
//#region src/lib/chart-types/bar-error/definition.ts
var barErrorRolesPath = "color_roles";
var barErrorConfigPath = "preview_config";
var requiredElementRoleKeys = [
	"axis",
	"grid",
	"text",
	"error_bar",
	"background"
];
var themeTokens$2 = [
	"foreground",
	"muted_foreground",
	"grid",
	"background"
];
var barErrorTemplate = {
	id: "bar_error_v1",
	chartType: "bar_error",
	templateVersion: 1,
	schemaVersion: 1,
	validateRoles(value) {
		const objectResult = validateObject(value, barErrorRolesPath, "INVALID_COLOR_ROLES");
		if (!objectResult.valid) return objectResult;
		const roles = value;
		return combineIssues([
			...rejectUnknownProperties(roles, ["groups", "elements"], barErrorRolesPath, "INVALID_COLOR_ROLES"),
			...requireArrayProperty(roles, "groups", barErrorRolesPath, "INVALID_COLOR_ROLES"),
			...requireObjectProperty(roles, "elements", barErrorRolesPath, "INVALID_COLOR_ROLES"),
			...validateGroupItems(roles.groups, `${barErrorRolesPath}.groups`),
			...validateRequiredElementRoles(roles.elements, `${barErrorRolesPath}.elements`)
		]);
	},
	validateConfig(value) {
		const objectResult = validateObject(value, barErrorConfigPath, "INVALID_PREVIEW_CONFIG");
		if (!objectResult.valid) return objectResult;
		const config = value;
		return combineIssues([
			...requireEnumProperty(config, "orientation", ["vertical", "horizontal"], barErrorConfigPath, "INVALID_PREVIEW_CONFIG"),
			...requirePositiveIntegerProperty(config, "sample_size", barErrorConfigPath, "INVALID_PREVIEW_CONFIG"),
			...requireEnumProperty(config, "error_type", [
				"sd",
				"sem",
				"ci"
			], barErrorConfigPath, "INVALID_PREVIEW_CONFIG"),
			...requireEnumProperty(config, "data_pattern", [
				"treatment_higher",
				"treatment_lower",
				"dose_response",
				"mixed"
			], barErrorConfigPath, "INVALID_PREVIEW_CONFIG")
		]);
	}
};
function validateGroupItems(value, path) {
	if (!Array.isArray(value)) return [];
	if (value.length < 1 || value.length > 5) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must contain 1 to 5 groups.`
	}];
	const seenKeys = /* @__PURE__ */ new Set();
	return value.flatMap((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) return [{
			path: itemPath,
			code: "INVALID_COLOR_ROLES",
			message: `${itemPath} must be an object.`
		}];
		const duplicateKeyIssue = typeof item.key === "string" && seenKeys.has(item.key) ? [{
			path: `${itemPath}.key`,
			code: "DUPLICATE_ROLE_KEY",
			message: `Duplicate group key: ${item.key}.`
		}] : [];
		if (typeof item.key === "string") seenKeys.add(item.key);
		return [
			...duplicateKeyIssue,
			...requireEnumLikeString(item, "key", itemPath),
			...requireEnumLikeString(item, "label", itemPath),
			...validatePaletteColorReference$3(item.fill, `${itemPath}.fill`)
		];
	});
}
function validateRequiredElementRoles(value, path) {
	if (!isRecord(value)) return [];
	return [...rejectUnknownProperties(value, requiredElementRoleKeys, path, "INVALID_COLOR_ROLES"), ...requiredElementRoleKeys.flatMap((key) => Object.prototype.hasOwnProperty.call(value, key) ? validateVisualColorReference$3(value[key], `${path}.${key}`) : requireObjectProperty(value, key, path, "INVALID_COLOR_ROLES"))];
}
function requireEnumLikeString(value, key, path) {
	return typeof value[key] === "string" && String(value[key]).trim() !== "" ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} must be a non-empty string.`
	}];
}
function validatePaletteColorReference$3(value, path) {
	if (!isRecord(value) || value.source !== "palette" || typeof value.color_id !== "string" || value.color_id.trim() === "") return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a palette color reference with color_id.`
	}];
	return validateOpacity$3(value.opacity, path);
}
function validateVisualColorReference$3(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a color reference.`
	}];
	if (value.source === "palette") return validatePaletteColorReference$3(value, path);
	if (value.source === "theme" && typeof value.token === "string" && themeTokens$2.includes(value.token)) return validateOpacity$3(value.opacity, path);
	return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must use a palette color or approved theme token.`
	}];
}
function validateOpacity$3(value, path) {
	return value === void 0 || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [] : [{
		path: `${path}.opacity`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.opacity must be between 0 and 1.`
	}];
}
//#endregion
//#region src/lib/chart-types/boxplot-jitter/definition.ts
var rolesPath$4 = "color_roles";
var configPath$4 = "preview_config";
var optionalElementRoleKeys$2 = [
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
];
var boxplotJitterTemplate = {
	id: "boxplot_jitter_v1",
	chartType: "boxplot_jitter",
	templateVersion: 1,
	schemaVersion: 1,
	validateRoles(value) {
		const objectResult = validateObject(value, rolesPath$4, "INVALID_COLOR_ROLES");
		if (!objectResult.valid) return objectResult;
		const roles = value;
		return combineIssues([
			...rejectUnknownProperties(roles, ["groups", "elements"], rolesPath$4, "INVALID_COLOR_ROLES"),
			...requireArrayProperty(roles, "groups", rolesPath$4, "INVALID_COLOR_ROLES"),
			...validateNamedRoles(roles.groups, `${rolesPath$4}.groups`),
			...validateOptionalElements$2(roles.elements, `${rolesPath$4}.elements`)
		]);
	},
	validateConfig(value) {
		const objectResult = validateObject(value, configPath$4, "INVALID_PREVIEW_CONFIG");
		if (!objectResult.valid) return objectResult;
		const config = value;
		return combineIssues([
			...requireEnumProperty(config, "jitter_density", [
				"low",
				"medium",
				"high"
			], configPath$4, "INVALID_PREVIEW_CONFIG"),
			...requirePrimitiveProperty(config, "show_outliers", "boolean", configPath$4, "INVALID_PREVIEW_CONFIG"),
			...validateOptionalString$2(config, "y_axis_label", configPath$4)
		]);
	}
};
function validateNamedRoles(value, path) {
	if (!Array.isArray(value)) return [];
	if (value.length < 1 || value.length > 5) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must contain 1 to 5 groups.`
	}];
	const seenKeys = /* @__PURE__ */ new Set();
	return value.flatMap((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) return [{
			path: itemPath,
			code: "INVALID_COLOR_ROLES",
			message: `${itemPath} must be an object.`
		}];
		const duplicateKeyIssue = typeof item.key === "string" && seenKeys.has(item.key) ? [{
			path: `${itemPath}.key`,
			code: "INVALID_COLOR_ROLES",
			message: `Duplicate group key: ${item.key}.`
		}] : [];
		if (typeof item.key === "string") seenKeys.add(item.key);
		return [
			...duplicateKeyIssue,
			...requireText$2(item, "key", itemPath),
			...requireText$2(item, "label", itemPath),
			...validatePaletteColorReference$2(item.color, `${itemPath}.color`)
		];
	});
}
function validateOptionalElements$2(value, path) {
	if (value === void 0) return [];
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be an object when present.`
	}];
	return [...rejectUnknownProperties(value, optionalElementRoleKeys$2, path, "INVALID_COLOR_ROLES"), ...Object.entries(value).flatMap(([key, reference]) => optionalElementRoleKeys$2.includes(key) ? validateVisualColorReference$2(reference, `${path}.${key}`) : [])];
}
function requireText$2(value, key, path) {
	return typeof value[key] === "string" && String(value[key]).trim() !== "" ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} must be a non-empty string.`
	}];
}
function validateOptionalString$2(value, key, path) {
	return value[key] === void 0 || typeof value[key] === "string" ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_PREVIEW_CONFIG",
		message: `${path}.${key} must be a string when present.`
	}];
}
function validatePaletteColorReference$2(value, path) {
	if (!isRecord(value) || value.source !== "palette" || typeof value.color_id !== "string" || value.color_id.trim() === "") return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a palette color reference with color_id.`
	}];
	return validateOpacity$2(value.opacity, path);
}
function validateVisualColorReference$2(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a color reference.`
	}];
	if (value.source === "palette") return validatePaletteColorReference$2(value, path);
	if (value.source === "theme" && typeof value.token === "string" && [
		"foreground",
		"muted_foreground",
		"grid",
		"background"
	].includes(value.token)) return validateOpacity$2(value.opacity, path);
	return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must use a palette color or approved theme token.`
	}];
}
function validateOpacity$2(value, path) {
	return value === void 0 || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [] : [{
		path: `${path}.opacity`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.opacity must be between 0 and 1.`
	}];
}
//#endregion
//#region src/lib/chart-types/heatmap-annotated/definition.ts
var rolesPath$3 = "color_roles";
var configPath$3 = "preview_config";
var optionalElementRoleKeys$1 = [
	"missing_value",
	"text",
	"border",
	"grid",
	"background",
	"annotation_text"
];
var heatmapAnnotatedTemplate = {
	id: "heatmap_annotated_v1",
	chartType: "heatmap_annotated",
	templateVersion: 1,
	schemaVersion: 1,
	validateRoles(value) {
		const objectResult = validateObject(value, rolesPath$3, "INVALID_COLOR_ROLES");
		if (!objectResult.valid) return objectResult;
		const roles = value;
		const scale = roles.scale;
		return combineIssues([
			...rejectUnknownProperties(roles, [
				"scale",
				"elements",
				"annotations"
			], rolesPath$3, "INVALID_COLOR_ROLES"),
			...validateScaleObject(roles.scale, `${rolesPath$3}.scale`),
			...validateOptionalElements$1(roles.elements, `${rolesPath$3}.elements`),
			...validateAnnotations(roles.annotations, `${rolesPath$3}.annotations`),
			...isRecord(scale) ? [
				...requireEnumProperty(scale, "type", ["sequential", "diverging"], `${rolesPath$3}.scale`, "INVALID_COLOR_ROLES"),
				...requireArrayProperty(scale, "stops", `${rolesPath$3}.scale`, "INVALID_COLOR_ROLES"),
				...validateScaleStopCount(scale, `${rolesPath$3}.scale`),
				...validateScaleStops(scale.stops, `${rolesPath$3}.scale.stops`)
			] : []
		]);
	},
	validateConfig(value) {
		const objectResult = validateObject(value, configPath$3, "INVALID_PREVIEW_CONFIG");
		if (!objectResult.valid) return objectResult;
		const config = value;
		return combineIssues([
			...requirePositiveIntegerProperty(config, "rows", configPath$3, "INVALID_PREVIEW_CONFIG"),
			...validateIntegerRange(config.rows, `${configPath$3}.rows`, 4, 8),
			...requirePositiveIntegerProperty(config, "columns", configPath$3, "INVALID_PREVIEW_CONFIG"),
			...validateIntegerRange(config.columns, `${configPath$3}.columns`, 4, 8),
			...requirePrimitiveProperty(config, "cluster_rows", "boolean", configPath$3, "INVALID_PREVIEW_CONFIG"),
			...requirePrimitiveProperty(config, "cluster_columns", "boolean", configPath$3, "INVALID_PREVIEW_CONFIG"),
			...requirePrimitiveProperty(config, "show_row_labels", "boolean", configPath$3, "INVALID_PREVIEW_CONFIG"),
			...requirePrimitiveProperty(config, "show_column_labels", "boolean", configPath$3, "INVALID_PREVIEW_CONFIG"),
			...requirePrimitiveProperty(config, "show_values", "boolean", configPath$3, "INVALID_PREVIEW_CONFIG"),
			...requireEnumProperty(config, "data_pattern", [
				"two_clusters",
				"three_clusters",
				"gradient",
				"mixed"
			], configPath$3, "INVALID_PREVIEW_CONFIG")
		]);
	}
};
function validateScaleObject(value, path) {
	return isRecord(value) ? [] : [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be an object.`
	}];
}
function validateOptionalElements$1(value, path) {
	if (value === void 0) return [];
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be an object when present.`
	}];
	return [...rejectUnknownProperties(value, optionalElementRoleKeys$1, path, "INVALID_COLOR_ROLES"), ...Object.entries(value).flatMap(([key, reference]) => optionalElementRoleKeys$1.includes(key) ? validateVisualColorReference$1(reference, `${path}.${key}`) : [])];
}
function validateAnnotations(value, path) {
	if (value === void 0) return [];
	if (!Array.isArray(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be an array when present.`
	}];
	const seenKeys = /* @__PURE__ */ new Set();
	return value.flatMap((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) return [{
			path: itemPath,
			code: "INVALID_COLOR_ROLES",
			message: `${itemPath} must be an object.`
		}];
		const duplicateKeyIssue = typeof item.key === "string" && seenKeys.has(item.key) ? [{
			path: `${itemPath}.key`,
			code: "INVALID_COLOR_ROLES",
			message: `Duplicate annotation key: ${item.key}.`
		}] : [];
		if (typeof item.key === "string") seenKeys.add(item.key);
		return [
			...duplicateKeyIssue,
			...requireText$1(item, "key", itemPath),
			...requireText$1(item, "label", itemPath),
			...validatePaletteColorReference$1(item.color, `${itemPath}.color`)
		];
	});
}
function validateScaleStopCount(scale, path) {
	if (!Array.isArray(scale.stops)) return [];
	if (scale.type === "sequential" && scale.stops.length < 2) return [{
		path: `${path}.stops`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.stops must contain at least 2 stops for a sequential scale.`
	}];
	if (scale.type === "diverging" && scale.stops.length < 3) return [{
		path: `${path}.stops`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.stops must contain at least 3 stops for a diverging scale.`
	}];
	return scale.stops.length > 0 ? [] : [{
		path: `${path}.stops`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.stops must not be empty.`
	}];
}
function validateScaleStops(value, path) {
	if (!Array.isArray(value)) return [];
	const issues = value.flatMap((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) return [{
			path: itemPath,
			code: "INVALID_COLOR_ROLES",
			message: `${itemPath} must be an object.`
		}];
		return [
			...requirePositiveNumber(item, "position", itemPath),
			...validateStopPositionRange(item.position, `${itemPath}.position`),
			...validatePaletteColorReference$1(item.color, `${itemPath}.color`),
			...validateOptionalString$1(item, "label", itemPath, "INVALID_COLOR_ROLES")
		];
	});
	for (let index = 1; index < value.length; index += 1) {
		const previous = isRecord(value[index - 1]) ? value[index - 1].position : void 0;
		const current = isRecord(value[index]) ? value[index].position : void 0;
		if (typeof previous === "number" && typeof current === "number" && Number.isFinite(previous) && Number.isFinite(current) && current <= previous) issues.push({
			path: `${path}[${index}].position`,
			code: "INVALID_COLOR_ROLES",
			message: `${path}[${index}].position must be greater than the previous stop position.`
		});
	}
	return issues;
}
function requirePositiveNumber(value, key, path) {
	return typeof value[key] === "number" && Number.isFinite(value[key]) ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} must be a number.`
	}];
}
function validateStopPositionRange(value, path) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [] : [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be between 0 and 1.`
	}];
}
function validateIntegerRange(value, path, min, max) {
	return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? [] : [{
		path,
		code: "INVALID_PREVIEW_CONFIG",
		message: `${path} must be between ${min} and ${max}.`
	}];
}
function requireText$1(value, key, path) {
	return typeof value[key] === "string" && String(value[key]).trim() !== "" ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} must be a non-empty string.`
	}];
}
function validateOptionalString$1(value, key, path, code) {
	return value[key] === void 0 || typeof value[key] === "string" ? [] : [{
		path: `${path}.${key}`,
		code,
		message: `${path}.${key} must be a string when present.`
	}];
}
function validatePaletteColorReference$1(value, path) {
	if (!isRecord(value) || value.source !== "palette" || typeof value.color_id !== "string" || value.color_id.trim() === "") return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a palette color reference with color_id.`
	}];
	return validateOpacity$1(value.opacity, path);
}
function validateVisualColorReference$1(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a color reference.`
	}];
	if (value.source === "palette") return validatePaletteColorReference$1(value, path);
	if (value.source === "theme" && typeof value.token === "string" && [
		"foreground",
		"muted_foreground",
		"grid",
		"background"
	].includes(value.token)) return validateOpacity$1(value.opacity, path);
	return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must use a palette color or approved theme token.`
	}];
}
function validateOpacity$1(value, path) {
	return value === void 0 || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [] : [{
		path: `${path}.opacity`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.opacity must be between 0 and 1.`
	}];
}
//#endregion
//#region src/lib/chart-types/line-multiseries/definition.ts
var rolesPath$2 = "color_roles";
var configPath$2 = "preview_config";
var optionalElementRoleKeys = [
	"axis",
	"grid",
	"reference_line",
	"text",
	"marker_stroke",
	"background"
];
var lineMultiseriesTemplate = {
	id: "line_multiseries_v1",
	chartType: "line_multiseries",
	templateVersion: 1,
	schemaVersion: 1,
	validateRoles(value) {
		const objectResult = validateObject(value, rolesPath$2, "INVALID_COLOR_ROLES");
		if (!objectResult.valid) return objectResult;
		const roles = value;
		return combineIssues([
			...rejectUnknownProperties(roles, ["series", "elements"], rolesPath$2, "INVALID_COLOR_ROLES"),
			...requireArrayProperty(roles, "series", rolesPath$2, "INVALID_COLOR_ROLES"),
			...validateSeriesItems(roles.series, `${rolesPath$2}.series`),
			...validateOptionalElements(roles.elements, `${rolesPath$2}.elements`)
		]);
	},
	validateConfig(value) {
		const objectResult = validateObject(value, configPath$2, "INVALID_PREVIEW_CONFIG");
		if (!objectResult.valid) return objectResult;
		const config = value;
		return combineIssues([
			...requirePositiveIntegerProperty(config, "point_count", configPath$2, "INVALID_PREVIEW_CONFIG"),
			...validatePointCountRange(config.point_count, `${configPath$2}.point_count`),
			...requireEnumProperty(config, "curve_shape", [
				"increasing",
				"decreasing",
				"sigmoid",
				"peak",
				"mixed"
			], configPath$2, "INVALID_PREVIEW_CONFIG"),
			...validateOptionalString(config, "x_axis_label", configPath$2),
			...validateOptionalString(config, "y_axis_label", configPath$2)
		]);
	}
};
function validateSeriesItems(value, path) {
	if (!Array.isArray(value)) return [];
	if (value.length < 1 || value.length > 5) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must contain 1 to 5 series.`
	}];
	const seenKeys = /* @__PURE__ */ new Set();
	return value.flatMap((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) return [{
			path: itemPath,
			code: "INVALID_COLOR_ROLES",
			message: `${itemPath} must be an object.`
		}];
		const duplicateKeyIssue = typeof item.key === "string" && seenKeys.has(item.key) ? [{
			path: `${itemPath}.key`,
			code: "INVALID_COLOR_ROLES",
			message: `Duplicate series key: ${item.key}.`
		}] : [];
		if (typeof item.key === "string") seenKeys.add(item.key);
		return [
			...duplicateKeyIssue,
			...requireText(item, "key", itemPath),
			...requireText(item, "label", itemPath),
			...validatePaletteColorReference(item.line, `${itemPath}.line`),
			...validateOptionalVisualColorReference(item.confidence_band, `${itemPath}.confidence_band`),
			...validateOptionalVisualColorReference(item.marker, `${itemPath}.marker`)
		];
	});
}
function validateOptionalElements(value, path) {
	if (value === void 0) return [];
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be an object when present.`
	}];
	return [...rejectUnknownProperties(value, optionalElementRoleKeys, path, "INVALID_COLOR_ROLES"), ...Object.entries(value).flatMap(([key, reference]) => optionalElementRoleKeys.includes(key) ? validateVisualColorReference(reference, `${path}.${key}`) : [])];
}
function validatePointCountRange(value, path) {
	return Number.isInteger(value) && Number(value) >= 6 && Number(value) <= 12 ? [] : [{
		path,
		code: "INVALID_PREVIEW_CONFIG",
		message: `${path} must be between 6 and 12.`
	}];
}
function requireText(value, key, path) {
	return typeof value[key] === "string" && String(value[key]).trim() !== "" ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} must be a non-empty string.`
	}];
}
function validateOptionalString(value, key, path) {
	return value[key] === void 0 || typeof value[key] === "string" ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_PREVIEW_CONFIG",
		message: `${path}.${key} must be a string when present.`
	}];
}
function validateOptionalVisualColorReference(value, path) {
	return value === void 0 ? [] : validateVisualColorReference(value, path);
}
function validatePaletteColorReference(value, path) {
	if (!isRecord(value) || value.source !== "palette" || typeof value.color_id !== "string" || value.color_id.trim() === "") return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a palette color reference with color_id.`
	}];
	return validateOpacity(value.opacity, path);
}
function validateVisualColorReference(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a color reference.`
	}];
	if (value.source === "palette") return validatePaletteColorReference(value, path);
	if (value.source === "theme" && typeof value.token === "string" && [
		"foreground",
		"muted_foreground",
		"grid",
		"background"
	].includes(value.token)) return validateOpacity(value.opacity, path);
	return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must use a palette color or approved theme token.`
	}];
}
function validateOpacity(value, path) {
	return value === void 0 || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [] : [{
		path: `${path}.opacity`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.opacity must be between 0 and 1.`
	}];
}
//#endregion
//#region src/lib/chart-types/scatter-grouped/definition.ts
var rolesPath$1 = "color_roles";
var configPath$1 = "preview_config";
var elementKeys$1 = [
	"axis",
	"muted_foreground",
	"grid",
	"background"
];
var themeTokens$1 = [
	"foreground",
	"muted_foreground",
	"grid",
	"background"
];
var scatterGroupedTemplate = {
	id: "scatter_grouped_v1",
	chartType: "scatter_grouped",
	templateVersion: 1,
	schemaVersion: 1,
	validateRoles(value) {
		const objectResult = validateObject(value, rolesPath$1, "INVALID_COLOR_ROLES");
		if (!objectResult.valid) return objectResult;
		const roles = value;
		return combineIssues([
			...rejectUnknownProperties(roles, ["groups", "elements"], rolesPath$1, "INVALID_COLOR_ROLES"),
			...requireArrayProperty(roles, "groups", rolesPath$1, "INVALID_COLOR_ROLES"),
			...validateGroups$1(roles.groups, `${rolesPath$1}.groups`),
			...validateElements$1(roles.elements, `${rolesPath$1}.elements`)
		]);
	},
	validateConfig(value) {
		const objectResult = validateObject(value, configPath$1, "INVALID_PREVIEW_CONFIG");
		if (!objectResult.valid) return objectResult;
		const config = value;
		return combineIssues([
			...requirePositiveIntegerProperty(config, "point_count", configPath$1, "INVALID_PREVIEW_CONFIG"),
			...integerRange$1(config.point_count, `${configPath$1}.point_count`, 8, 30),
			...requireEnumProperty(config, "data_pattern", [
				"clusters",
				"positive",
				"negative",
				"mixed"
			], configPath$1, "INVALID_PREVIEW_CONFIG"),
			...requireEnumProperty(config, "point_size", [
				"small",
				"medium",
				"large"
			], configPath$1, "INVALID_PREVIEW_CONFIG"),
			...optionalNumber(config, "point_opacity", configPath$1, .25, 1)
		]);
	}
};
function validateGroups$1(value, path) {
	if (!Array.isArray(value)) return [];
	if (value.length < 1 || value.length > 5) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must contain 1 to 5 groups.`
	}];
	const seen = /* @__PURE__ */ new Set();
	return value.flatMap((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) return [{
			path: itemPath,
			code: "INVALID_COLOR_ROLES",
			message: `${itemPath} must be an object.`
		}];
		const issues = [
			...text$1(item, "key", itemPath),
			...text$1(item, "label", itemPath),
			...paletteReference$1(item.color, `${itemPath}.color`)
		];
		if (typeof item.key === "string" && seen.has(item.key)) issues.push({
			path: `${itemPath}.key`,
			code: "DUPLICATE_ROLE_KEY",
			message: `Duplicate group key: ${item.key}.`
		});
		if (typeof item.key === "string") seen.add(item.key);
		return issues;
	});
}
function validateElements$1(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be an object.`
	}];
	return [...rejectUnknownProperties(value, elementKeys$1, path, "INVALID_COLOR_ROLES"), ...elementKeys$1.flatMap((key) => Object.prototype.hasOwnProperty.call(value, key) ? visualReference$1(value[key], `${path}.${key}`) : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} is required.`
	}])];
}
function paletteReference$1(value, path) {
	if (!isRecord(value) || value.source !== "palette" || typeof value.color_id !== "string" || !value.color_id.trim()) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a palette color reference with color_id.`
	}];
	return opacity$1(value.opacity, path);
}
function visualReference$1(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a color reference.`
	}];
	if (value.source === "palette") return paletteReference$1(value, path);
	if (value.source === "theme" && typeof value.token === "string" && themeTokens$1.includes(value.token)) return opacity$1(value.opacity, path);
	return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must use a palette color or approved theme token.`
	}];
}
function opacity$1(value, path) {
	return value === void 0 || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [] : [{
		path: `${path}.opacity`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.opacity must be between 0 and 1.`
	}];
}
function text$1(value, key, path) {
	return typeof value[key] === "string" && String(value[key]).trim() ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} must be a non-empty string.`
	}];
}
function integerRange$1(value, path, min, max) {
	return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? [] : [{
		path,
		code: "INVALID_PREVIEW_CONFIG",
		message: `${path} must be between ${min} and ${max}.`
	}];
}
function optionalNumber(value, key, path, min, max) {
	const candidate = value[key];
	return candidate === void 0 || typeof candidate === "number" && Number.isFinite(candidate) && candidate >= min && candidate <= max ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_PREVIEW_CONFIG",
		message: `${path}.${key} must be between ${min} and ${max}.`
	}];
}
//#endregion
//#region src/lib/chart-types/violin-distribution/definition.ts
var rolesPath = "color_roles";
var configPath = "preview_config";
var elementKeys = [
	"outline",
	"median",
	"axis",
	"grid",
	"background"
];
var themeTokens = [
	"foreground",
	"muted_foreground",
	"grid",
	"background"
];
var violinDistributionTemplate = {
	id: "violin_distribution_v1",
	chartType: "violin_distribution",
	templateVersion: 1,
	schemaVersion: 1,
	validateRoles(value) {
		const objectResult = validateObject(value, rolesPath, "INVALID_COLOR_ROLES");
		if (!objectResult.valid) return objectResult;
		const roles = value;
		return combineIssues([
			...rejectUnknownProperties(roles, ["groups", "elements"], rolesPath, "INVALID_COLOR_ROLES"),
			...requireArrayProperty(roles, "groups", rolesPath, "INVALID_COLOR_ROLES"),
			...validateGroups(roles.groups, `${rolesPath}.groups`),
			...validateElements(roles.elements, `${rolesPath}.elements`)
		]);
	},
	validateConfig(value) {
		const objectResult = validateObject(value, configPath, "INVALID_PREVIEW_CONFIG");
		if (!objectResult.valid) return objectResult;
		const config = value;
		return combineIssues([
			...requirePositiveIntegerProperty(config, "sample_count", configPath, "INVALID_PREVIEW_CONFIG"),
			...integerRange(config.sample_count, `${configPath}.sample_count`, 16, 48),
			...requireEnumProperty(config, "distribution_shape", [
				"normal",
				"skewed",
				"bimodal",
				"mixed"
			], configPath, "INVALID_PREVIEW_CONFIG"),
			...requireEnumProperty(config, "bandwidth", [
				"narrow",
				"medium",
				"wide"
			], configPath, "INVALID_PREVIEW_CONFIG"),
			...requirePrimitiveProperty(config, "show_summary", "boolean", configPath, "INVALID_PREVIEW_CONFIG")
		]);
	}
};
function validateGroups(value, path) {
	if (!Array.isArray(value)) return [];
	if (value.length < 1 || value.length > 5) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must contain 1 to 5 distributions.`
	}];
	const seen = /* @__PURE__ */ new Set();
	return value.flatMap((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) return [{
			path: itemPath,
			code: "INVALID_COLOR_ROLES",
			message: `${itemPath} must be an object.`
		}];
		const issues = [
			...text(item, "key", itemPath),
			...text(item, "label", itemPath),
			...paletteReference(item.fill, `${itemPath}.fill`)
		];
		if (typeof item.key === "string" && seen.has(item.key)) issues.push({
			path: `${itemPath}.key`,
			code: "DUPLICATE_ROLE_KEY",
			message: `Duplicate distribution key: ${item.key}.`
		});
		if (typeof item.key === "string") seen.add(item.key);
		return issues;
	});
}
function validateElements(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be an object.`
	}];
	return [...rejectUnknownProperties(value, elementKeys, path, "INVALID_COLOR_ROLES"), ...elementKeys.flatMap((key) => Object.prototype.hasOwnProperty.call(value, key) ? visualReference(value[key], `${path}.${key}`) : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} is required.`
	}])];
}
function paletteReference(value, path) {
	if (!isRecord(value) || value.source !== "palette" || typeof value.color_id !== "string" || !value.color_id.trim()) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a palette color reference with color_id.`
	}];
	return opacity(value.opacity, path);
}
function visualReference(value, path) {
	if (!isRecord(value)) return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must be a color reference.`
	}];
	if (value.source === "palette") return paletteReference(value, path);
	if (value.source === "theme" && typeof value.token === "string" && themeTokens.includes(value.token)) return opacity(value.opacity, path);
	return [{
		path,
		code: "INVALID_COLOR_ROLES",
		message: `${path} must use a palette color or approved theme token.`
	}];
}
function opacity(value, path) {
	return value === void 0 || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [] : [{
		path: `${path}.opacity`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.opacity must be between 0 and 1.`
	}];
}
function text(value, key, path) {
	return typeof value[key] === "string" && String(value[key]).trim() ? [] : [{
		path: `${path}.${key}`,
		code: "INVALID_COLOR_ROLES",
		message: `${path}.${key} must be a non-empty string.`
	}];
}
function integerRange(value, path, min, max) {
	return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? [] : [{
		path,
		code: "INVALID_PREVIEW_CONFIG",
		message: `${path} must be between ${min} and ${max}.`
	}];
}
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
export { CHART_TYPE_DEFINITIONS, getChartTemplateDefinition, getChartTypeDefinition, lookupChartTemplateDefinition, registerChartTypes, validatePreviewCaseAgainstRegistry, validatePreviewTemplateReference };
