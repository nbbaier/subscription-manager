import {
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
} from "recharts";

interface SpendingData {
	name: string;
	value: number;
	color: string;
	[key: string]: string | number;
}

interface SpendingBreakdownProps {
	data: SpendingData[];
}

export function SpendingBreakdown({ data }: SpendingBreakdownProps) {
	return (
		<div className="h-[300px] w-full">
			<ResponsiveContainer width="100%" height="100%">
				<PieChart>
					<Pie
						data={data}
						cx="50%"
						cy="50%"
						innerRadius={60}
						outerRadius={80}
						paddingAngle={5}
						dataKey="value"
					>
						{data.map((entry) => (
							<Cell key={`cell-${entry.name}`} fill={entry.color} />
						))}
					</Pie>
					<Tooltip
						contentStyle={{
							backgroundColor: "#fff",
							borderRadius: "8px",
							border: "1px solid #e5e7eb",
							boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
						}}
						formatter={(value: number | undefined) =>
							value !== undefined ? `$${(value / 100).toFixed(2)}` : ""
						}
					/>
					<Legend verticalAlign="bottom" height={36} />
				</PieChart>
			</ResponsiveContainer>
		</div>
	);
}
