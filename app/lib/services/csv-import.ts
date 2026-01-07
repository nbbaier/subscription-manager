import { type NewSubscription, SubscriptionService } from "./subscription.ts";

export interface CSVImportResult {
	success: boolean;
	imported: number;
	errors: { row: number; message: string }[];
	subscriptions: { id: string; name: string }[];
}

const VALID_FREQUENCIES = ["monthly", "yearly", "weekly", "one-time"] as const;

function parseDate(value: string): number | undefined {
	if (!value.trim()) return undefined;
	const parsed = Date.parse(value.trim());
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid date: ${value}`);
	}
	return parsed;
}

function parseCSV(content: string): string[][] {
	const lines = content.trim().split("\n");
	return lines.map((line) => {
		const values: string[] = [];
		let current = "";
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === "," && !inQuotes) {
				values.push(current.trim());
				current = "";
			} else {
				current += char;
			}
		}
		values.push(current.trim());
		return values;
	});
}

function parseCostToCents(value: string): number {
	const cleaned = value.replace(/[$,\s]/g, "");
	const parsed = Number.parseFloat(cleaned);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid cost value: ${value}`);
	}
	return Math.round(parsed * 100);
}

function normalizeFrequency(
	value: string,
): "monthly" | "yearly" | "weekly" | "one-time" {
	const normalized = value.toLowerCase().trim();
	if (normalized === "annual" || normalized === "year") return "yearly";
	if (normalized === "month") return "monthly";
	if (normalized === "week") return "weekly";
	if (normalized === "once" || normalized === "onetime") return "one-time";

	if (
		VALID_FREQUENCIES.includes(normalized as (typeof VALID_FREQUENCIES)[number])
	) {
		return normalized as "monthly" | "yearly" | "weekly" | "one-time";
	}
	throw new Error(`Invalid billing frequency: ${value}`);
}

export function importFromCSV(csvContent: string): CSVImportResult {
	const rows = parseCSV(csvContent);
	if (rows.length === 0) {
		return {
			success: false,
			imported: 0,
			errors: [{ row: 0, message: "Empty CSV" }],
			subscriptions: [],
		};
	}

	const headerRow = rows[0];
	if (!headerRow) {
		return {
			success: false,
			imported: 0,
			errors: [{ row: 0, message: "No header row" }],
			subscriptions: [],
		};
	}

	const headers = headerRow.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));

	const nameIdx = headers.findIndex(
		(h) => h === "name" || h === "subscription",
	);
	const costIdx = headers.findIndex(
		(h) => h === "cost" || h === "price" || h === "amount",
	);
	const freqIdx = headers.findIndex(
		(h) => h === "frequency" || h === "billing" || h === "billingfrequency",
	);
	const categoryIdx = headers.findIndex(
		(h) => h === "category" || h === "type",
	);
	const descIdx = headers.findIndex(
		(h) => h === "description" || h === "notes",
	);
	const nextBillingIdx = headers.findIndex(
		(h) =>
			h === "nextbillingdate" ||
			h === "nextbilling" ||
			h === "renewaldate" ||
			h === "renewal",
	);

	if (nameIdx === -1) {
		return {
			success: false,
			imported: 0,
			errors: [{ row: 1, message: "Missing 'name' column" }],
			subscriptions: [],
		};
	}
	if (costIdx === -1) {
		return {
			success: false,
			imported: 0,
			errors: [{ row: 1, message: "Missing 'cost' column" }],
			subscriptions: [],
		};
	}

	const errors: { row: number; message: string }[] = [];
	const imported: { id: string; name: string }[] = [];

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (!row || row.every((cell) => !cell.trim())) continue;

		try {
			const name = row[nameIdx]?.trim();
			if (!name) {
				errors.push({ row: i + 1, message: "Missing name" });
				continue;
			}

			const costValue = row[costIdx]?.trim();
			if (!costValue) {
				errors.push({ row: i + 1, message: "Missing cost" });
				continue;
			}
			const costCents = parseCostToCents(costValue);

			let billingFrequency: "monthly" | "yearly" | "weekly" | "one-time" =
				"monthly";
			if (freqIdx !== -1 && row[freqIdx]) {
				try {
					billingFrequency = normalizeFrequency(row[freqIdx]);
				} catch {
					billingFrequency = "monthly";
				}
			}

			const category =
				categoryIdx !== -1 ? row[categoryIdx]?.trim() : undefined;
			const description = descIdx !== -1 ? row[descIdx]?.trim() : undefined;

			let nextBillingDate: number | undefined;
			if (nextBillingIdx !== -1 && row[nextBillingIdx]) {
				try {
					nextBillingDate = parseDate(row[nextBillingIdx]);
				} catch {
					errors.push({
						row: i + 1,
						message: `Invalid next billing date: ${row[nextBillingIdx]}`,
					});
				}
			}

			const newSub: NewSubscription = {
				name,
				costCents,
				billingFrequency,
				category: category || undefined,
				description: description || undefined,
				nextBillingDate,
			};

			const subscription = SubscriptionService.createSubscription(newSub);
			imported.push({ id: subscription.id, name: subscription.name });
		} catch (err) {
			errors.push({
				row: i + 1,
				message: err instanceof Error ? err.message : "Unknown error",
			});
		}
	}

	return {
		success: errors.length === 0,
		imported: imported.length,
		errors,
		subscriptions: imported,
	};
}

export const CSVImportService = {
	importFromCSV,
};
