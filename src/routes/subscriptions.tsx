import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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

interface Subscription {
	id: string;
	name: string;
	cost_cents: number;
	billing_frequency: string;
	next_billing_date: number | null;
	status: string;
	category: string | null;
}

export const Route = createFileRoute("/subscriptions")({
	component: Subscriptions,
});

function Subscriptions() {
	const {
		data: subscriptions,
		isLoading,
		error,
	} = useQuery<Subscription[]>({
		queryKey: ["subscriptions"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/subscriptions`);
			if (!response.ok) throw new Error("Failed to fetch subscriptions");
			return response.json();
		},
	});

	const formatCurrency = (cents: number) => {
		return `$${(cents / 100).toFixed(2)}`;
	};

	const getStatusVariant = (status: string) => {
		switch (status) {
			case "active":
				return "default";
			case "paused":
				return "secondary";
			case "cancelled":
				return "destructive";
			default:
				return "outline";
		}
	};

	if (isLoading) {
		return <div className="p-8 text-center">Loading subscriptions...</div>;
	}

	if (error) {
		return (
			<div className="p-8 text-center text-red-500">
				Error loading subscriptions: {(error as Error).message}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-3xl font-bold text-gray-900">Subscriptions</h2>
				<Link
					to="/subscriptions"
					className={cn(buttonVariants({ variant: "default" }))}
				>
					+ Add Subscription
				</Link>
			</div>

			<div className="bg-white rounded-xl shadow-sm border overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Cost</TableHead>
							<TableHead>Frequency</TableHead>
							<TableHead>Next Bill</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{!subscriptions || subscriptions.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
									No subscriptions found.
								</TableCell>
							</TableRow>
						) : (
							subscriptions.map((sub) => (
								<TableRow key={sub.id}>
									<TableCell className="font-medium">{sub.name}</TableCell>
									<TableCell>{sub.category || "Uncategorized"}</TableCell>
									<TableCell>{formatCurrency(sub.cost_cents)}</TableCell>
									<TableCell className="capitalize">
										{sub.billing_frequency}
									</TableCell>
									<TableCell>
										{sub.next_billing_date
											? format(new Date(sub.next_billing_date), "MMM d, yyyy")
											: "N/A"}
									</TableCell>
									<TableCell>
										<Badge variant={getStatusVariant(sub.status)}>
											{sub.status}
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										<Link
											to="/subscriptions"
											className={cn(
												buttonVariants({ variant: "ghost", size: "sm" }),
											)}
										>
											Details
										</Link>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
