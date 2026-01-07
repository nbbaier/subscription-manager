import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

interface ImportResult {
	success: boolean;
	imported: number;
	errors: { row: number; message: string }[];
	subscriptions: { id: string; name: string }[];
}

export function CSVImportDialog() {
	const [open, setOpen] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [result, setResult] = useState<ImportResult | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();

	const importMutation = useMutation({
		mutationFn: async (csvFile: File) => {
			const formData = new FormData();
			formData.append("file", csvFile);

			const response = await fetch(`${API_BASE}/api/subscriptions/import-csv`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Import failed");
			}

			return response.json() as Promise<ImportResult>;
		},
		onSuccess: (data) => {
			setResult(data);
			if (data.imported > 0) {
				queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
			}
		},
	});

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0];
		if (selectedFile) {
			setFile(selectedFile);
			setResult(null);
		}
	};

	const handleImport = () => {
		if (file) {
			importMutation.mutate(file);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setFile(null);
		setResult(null);
		importMutation.reset();
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button variant="outline" />}>
				Import CSV
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import Subscriptions from CSV</DialogTitle>
					<DialogDescription>
						Upload a CSV file with columns: name, cost, frequency (optional),
						category (optional), description (optional), nextBillingDate
						(optional)
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex flex-col gap-2">
						<input
							ref={fileInputRef}
							type="file"
							accept=".csv,text/csv"
							onChange={handleFileChange}
							className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
						/>
						{file && (
							<p className="text-xs text-muted-foreground">
								Selected: {file.name}
							</p>
						)}
					</div>

					{importMutation.isPending && (
						<p className="text-sm text-muted-foreground">Importing...</p>
					)}

					{importMutation.isError && (
						<p className="text-sm text-destructive">
							Error: {importMutation.error.message}
						</p>
					)}

					{result && (
						<div className="space-y-2 text-sm">
							<p className="font-medium">
								{result.imported > 0 ? (
									<span className="text-green-600">
										Successfully imported {result.imported} subscription
										{result.imported !== 1 ? "s" : ""}
									</span>
								) : (
									<span className="text-destructive">
										No subscriptions imported
									</span>
								)}
							</p>
							{result.errors.length > 0 && (
								<div className="text-destructive">
									<p className="font-medium">Errors:</p>
									<ul className="list-disc list-inside max-h-32 overflow-y-auto">
										{result.errors.map((err) => (
											<li key={`${err.row}-${err.message}`}>
												Row {err.row}: {err.message}
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
					)}

					<div className="bg-muted/50 rounded-md p-3 text-xs">
						<p className="font-medium mb-1">Example CSV format:</p>
						<pre className="text-muted-foreground">
							{`name,cost,frequency,category,nextBillingDate
Netflix,$15.49,monthly,streaming,2026-02-15
Spotify,$10.99,monthly,music,2026-01-20
GitHub Pro,$4.00,monthly,productivity,2026-02-01`}
						</pre>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose}>
						{result?.imported ? "Done" : "Cancel"}
					</Button>
					<Button
						onClick={handleImport}
						disabled={!file || importMutation.isPending}
					>
						{importMutation.isPending ? "Importing..." : "Import"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
