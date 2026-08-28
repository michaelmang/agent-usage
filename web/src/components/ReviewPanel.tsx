import ReactMarkdown from 'react-markdown';

import type { ReviewResult } from '@/lib/types';
import { formatClock } from '@/lib/format';

export function ReviewPanel({ review }: { review?: ReviewResult }) {
  if (!review) {
    return (
      <section className="rounded-xl border border-dashed border-stone-800 bg-stone-900/20 p-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-500">
          Workflow review
        </h2>
        <p className="mt-3 text-sm text-stone-500">
          No review yet. Click <strong className="text-stone-400">Generate review</strong> for LLM
          feedback on productivity, model choices, and delegation patterns.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="border-b border-stone-800/80 px-5 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-500">
          Workflow review
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          {review.model} · {formatClock(review.generatedAt)}
          {review.inputTokens != null && (
            <> · {review.inputTokens + (review.outputTokens ?? 0)} tokens</>
          )}
        </p>
      </div>
      <div className="review-prose px-5 py-4 text-sm leading-relaxed text-stone-300">
        <ReactMarkdown>{review.text}</ReactMarkdown>
      </div>
    </section>
  );
}
