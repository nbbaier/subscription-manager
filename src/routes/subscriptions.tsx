import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/subscriptions")({
	component: Subscriptions,
});

function Subscriptions() {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold text-gray-900">Subscriptions</h2>
			<div className="bg-white rounded-xl shadow-sm p-6">
				<p className="text-gray-600">
					Manage your subscriptions here. This page will be built out with full
					CRUD functionality.
				</p>
			</div>
		</div>
	);
}
