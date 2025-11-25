import * as path from "path";

export interface FilenameMappingRule {
	from: string;
	to: string;
}

// 默认规则：将常见的 Windows 非法字符映射为全角/安全字符，保证可读性和可逆性
export const DEFAULT_FILENAME_RULES: FilenameMappingRule[] = [
	{ from: ":", to: "：" },
	{ from: "?", to: "？" },
	{ from: "*", to: "＊" },
	{ from: "<", to: "＜" },
	{ from: ">", to: "＞" },
	{ from: '"', to: "＂" },
	{ from: "|", to: "｜" },
	{ from: "\\", to: "＼" },
	// 在很多系统中允许空格，但为了兼容用户在 Windows 下的命名习惯，这里默认替换为空心点
	{ from: " ", to: "·" },
	// 保险起见，路径分隔符 “/” 也做一次映射，避免出现在单个段名中时出问题
	{ from: "/", to: "／" },
];

function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mapSegmentForward(
	segment: string,
	rules: FilenameMappingRule[],
): string {
	let result = segment;
	for (const rule of rules) {
		if (!rule.from) continue;
		const from = escapeRegExp(rule.from);
		const re = new RegExp(from, "g");
		result = result.replace(re, rule.to ?? "");
	}
	return result;
}

export function mapSegmentBackward(
	segment: string,
	rules: FilenameMappingRule[],
): string {
	let result = segment;
	for (const rule of rules) {
		if (!rule.to) continue;
		const to = escapeRegExp(rule.to);
		const re = new RegExp(to, "g");
		result = result.replace(re, rule.from);
	}
	return result;
}

// 逻辑路径使用 "/" 作为分隔符；在物理路径上使用当前系统的 path.sep。
export function getTargetAbsolutePath(
	targetRoot: string,
	relPath: string,
	rules: FilenameMappingRule[],
): string {
	if (!relPath) {
		return targetRoot;
	}
	const segments = relPath.split("/");
	const mapped = segments.map((seg) =>
		seg === "" ? seg : mapSegmentForward(seg, rules),
	);
	return path.join(targetRoot, ...mapped);
}

export function getRelPathFromTargetAbsolute(
	targetRoot: string,
	absolutePath: string,
	rules: FilenameMappingRule[],
): string {
	const relative = path.relative(targetRoot, absolutePath);
	if (!relative) return "";
	const segments = relative.split(path.sep);
	const decoded = segments.map((seg) =>
		seg === "" ? seg : mapSegmentBackward(seg, rules),
	);
	return decoded.join("/");
}

export function getSourceAbsolutePath(
	sourceRoot: string,
	relPath: string,
): string {
	if (!relPath) {
		return sourceRoot;
	}
	const segments = relPath.split("/");
	return path.join(sourceRoot, ...segments);
}

export function getRelPathFromSourceAbsolute(
	sourceRoot: string,
	absolutePath: string,
): string {
	const relative = path.relative(sourceRoot, absolutePath);
	if (!relative) return "";
	const segments = relative.split(path.sep);
	return segments.join("/");
}


