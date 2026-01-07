import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

interface Recommendation {
	subscriptionId: string;
	subscriptionName: string;
	type: "cancel" | "downgrade" | "review";
	reason: string;
	potentialSavingsCents: number;
	priority: "high" | "medium" | "low";
}

interface Decision {
	id: string;
	subscriptionId: string;
	subscriptionName: string;
	decisionDate: number;
	decision: "keep" | "cancel" | "downgrade" | "pause" | "review_later";
	reasoning: string | null;
	outcome: string | null;
	savingsSince: number;
}

interface SavingsSummary {
	monthlySavingsCents: number;
	yearlySavingsCents: number;
	totalSavedCents: number;
	cancelledCount: number;
}

export const Route = createFileRoute("/decisions")({
	component: Decisions,
});

function Decisions() {
	const { data: recommendations, isLoading: recsLoading } = useQuery<
		Recommendation[]
	>({
		queryKey: ["recommendations"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/recommendations`);
			if (!response.ok) throw new Error("Failed to fetch recommendations");
			return response.json();
		},
	});

	const { data: decisions, isLoading: decisionsLoading } = useQuery<Decision[]>(
		{
			queryKey: ["decisions"],
			queryFn: async () => {
				const response = await fetch(`${API_BASE}/api/decisions`);
				if (!response.ok) throw new Error("Failed to fetch decisions");
				return response.json();
			},
		},
	);

	const { data: savings } = useQuery<SavingsSummary>({
		queryKey: ["savings"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/decisions/savings`);
			if (!response.ok) throw new Error("Failed to fetch savings");
			return response.json();
		},
	});

	const formatCurrency = (cents: number) => {
		return `$${(cents / 100).toFixed(2)}`;
	};

	const getPriorityVariant = (priority: string) => {
		switch (priority) {
			case "high":
				return "destructive";
			case "medium":
				return "default";
			default:
				return "secondary";
		}
	};

	const getDecisionVariant = (decision: string) => {
		switch (decision) {
			case "cancel":
				return "destructive";
			case "keep":
				return "default";
			case "downgrade":
				return "secondary";
			case "pause":
				return "outline";
			default:
				return "ghost";
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-3xl font-bold text-gray-900 tracking-tight">
					Decisions & Recommendations
				</h2>
			</div>

			{/* Savings Overview */}
			{savings && (
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<Card className="bg-green-50/50 border-green-200">
						<CardHeader className="pb-2">
							<CardTitle className="text-xs font-semibold uppercase tracking-wider text-green-700">
								Monthly Savings
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-3xl font-bold tracking-tight text-green-800">
								{formatCurrency(savings.monthlySavingsCents)}
							</p>
						</CardContent>
					</Card>
					<Card className="bg-green-50/50 border-green-200">
						<CardHeader className="pb-2">
							<CardTitle className="text-xs font-semibold uppercase tracking-wider text-green-700">
								Yearly Savings
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-3xl font-bold tracking-tight text-green-800">
								{formatCurrency(savings.yearlySavingsCents)}
							</p>
						</CardContent>
					</Card>
					<Card className="bg-indigo-50/50 border-indigo-200">
						<CardHeader className="pb-2">
							<CardTitle className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
								Total Saved to Date
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-3xl font-bold tracking-tight text-indigo-800">
								{formatCurrency(savings.totalSavedCents)}
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Recommendations Column */}
				<div className="lg:col-span-1 space-y-4">
					<h3 className="text-xl font-semibold text-gray-900">
						Recommendations
					</h3>
					{recsLoading ? (
						<p>Loading recommendations...</p>
					) : !recommendations || recommendations.length === 0 ? (
						<Card>
							<CardContent className="pt-6">
								<p className="text-muted-foreground text-sm">
									No recommendations yet. Log more usage data to see insights.
								</p>
							</CardContent>
						</Card>
					) : (
						recommendations.map((rec) => (
							<Card key={rec.subscriptionId} className="border-l-4">
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between">
										<Badge variant={getPriorityVariant(rec.priority)}>
											{rec.priority} Priority
										</Badge>
										<span className="text-xs font-bold text-green-600">
											Save {formatCurrency(rec.potentialSavingsCents)}/mo
										</span>
									</div>
									<CardTitle className="mt-2">{rec.subscriptionName}</CardTitle>
									<CardDescription className="capitalize">
										{rec.type} suggested
									</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-gray-600 mb-4">{rec.reason}</p>
									<Link
										to="/subscriptions"
										className={cn(
											buttonVariants({ variant: "outline", size: "sm" }),
											"w-full",
										)}
									>
										Take Action
									</Link>
								</CardContent>
							</Card>
						))
					)}
				</div>

				{/* Decision History Column */}
				<div className="lg:col-span-2 space-y-4">
					<h3 className="text-xl font-semibold text-gray-900">
						Decision History
					</h3>
					<div className="bg-white rounded-xl shadow-sm border overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Subscription</TableHead>
									<TableHead>Decision</TableHead>
									<TableHead>Date</TableHead>
									<TableHead>Outcome</TableHead>
									<TableHead className="text-right">Saved</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{decisionsLoading ? (
									<TableRow>
										<TableCell colSpan={5} className="h-24 text-center">
											Loading decisions...
										</TableCell>
									</TableRow>
								) : !decisions || decisions.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className="h-24 text-center">
											No decisions logged yet.
										</TableCell>
									</TableRow>
								) : (
									decisions.map((dec) => (
										<TableRow key={dec.id}>
											<TableCell className="font-medium">
												{dec.subscriptionName}
											</TableCell>
											<TableCell>
												<Badge variant={getDecisionVariant(dec.decision)}>
													{dec.decision}
												</Badge>
											</TableCell>
											<TableCell className="text-xs">
												{format(new Date(dec.decisionDate), "MMM d, yyyy")}
											</TableCell>
											<TableCell className="text-xs italic">
												{dec.outcome || "Pending"}
											</TableCell>
											<TableCell className="text-right font-bold text-green-600">
												{formatCurrency(dec.savingsSince)}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</div>
			</div>
		</div>
	);
}
