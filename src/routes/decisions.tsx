import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/decisions")({
	component: Decisions,
});

function Decisions() {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold text-gray-900">Decisions</h2>
			<div className="bg-white rounded-xl shadow-sm p-6">
				<p className="text-gray-600">
					Track your subscription decisions and get recommendations here.
				</p>
			</div>
		</div>
	);
}
