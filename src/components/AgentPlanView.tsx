"use client";

import type { AgentPlan } from "@/types";

interface Props {
  plan: AgentPlan | null;
  onClose: () => void;
}

export default function AgentPlanView({ plan, onClose }: Props) {
  if (!plan) return null;

  return (
    <div
      role="status"
      aria-label="エージェント実行計画"
      className="bg-gray-900 border border-gray-700 rounded-lg p-4 mx-4 mb-2"
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-sm font-semibold text-yellow-400">
          実行計画: {plan.goal.slice(0, 40)}...
        </h3>
        <button
          onClick={onClose}
          aria-label="計画を閉じる"
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          ×
        </button>
      </div>
      <ol className="space-y-1">
        {plan.tasks.map((task, idx) => (
          <li
            key={task.id}
            className={`text-xs flex items-center gap-2 ${
              task.status === "completed"
                ? "text-green-400"
                : task.status === "running"
                ? "text-yellow-400"
                : task.status === "failed"
                ? "text-red-400"
                : "text-gray-400"
            }`}
          >
            <span aria-hidden="true">
              {task.status === "completed"
                ? "✓"
                : task.status === "running"
                ? "▶"
                : task.status === "failed"
                ? "✗"
                : `${idx + 1}.`}
            </span>
            {task.description}
          </li>
        ))}
      </ol>
    </div>
  );
}
