import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import type { CommentView } from "~/services/commentService";
import { MAX_COMMENT_LENGTH } from "~/lib/comments";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

export type RenderedComment = CommentView & { bodyHtml: string | null };
export type RenderedThread = RenderedComment & { replies: RenderedComment[] };

type CommentActionData = { ok: boolean; error: string | null };

/**
 * A keyed fetcher for one comment form. Toasts errors and calls `onSuccess`
 * once a submission completes successfully.
 */
function useCommentFetcher(key: string, onSuccess?: () => void) {
  const fetcher = useFetcher<CommentActionData>({ key });
  const wasSubmitting = useRef(false);

  useEffect(() => {
    if (fetcher.state !== "idle") {
      wasSubmitting.current = true;
      return;
    }
    if (!wasSubmitting.current) return;
    wasSubmitting.current = false;
    if (fetcher.data?.error) {
      toast.error(fetcher.data.error);
    } else if (fetcher.data?.ok) {
      onSuccess?.();
    }
  }, [fetcher.state, fetcher.data, onSuccess]);

  return fetcher;
}

function formatDate(iso: string) {
  // Fixed locale + UTC so server and client render the same string.
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function LessonDiscussion({
  lessonId,
  threads,
  count,
}: {
  lessonId: number;
  threads: RenderedThread[];
  count: number;
}) {
  return (
    <section className="mb-8 border-t pt-6" aria-labelledby="discussion-heading">
      <h2
        id="discussion-heading"
        className="mb-4 flex items-center gap-2 text-lg font-semibold"
      >
        <MessageSquare className="size-5" />
        Discussion ({count})
      </h2>

      <CommentForm
        fetcherKey={`add-comment-${lessonId}`}
        intent="add-comment"
        placeholder="Ask a question or share a thought… (Markdown supported)"
        submitLabel="Post comment"
      />

      {threads.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No comments yet. Start the discussion!
        </p>
      ) : (
        <ol className="mt-6 space-y-6">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Thread thread={thread} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Thread({ thread }: { thread: RenderedThread }) {
  const [replying, setReplying] = useState(false);

  return (
    <div>
      <Comment comment={thread} />
      {(thread.replies.length > 0 || replying) && (
        <div className="mt-3 ml-6 space-y-3 border-l pl-4">
          {thread.replies.map((reply) => (
            <Comment key={reply.id} comment={reply} />
          ))}
          {replying && (
            <CommentForm
              fetcherKey={`reply-${thread.id}`}
              intent="add-comment"
              parentId={thread.id}
              placeholder="Write a reply…"
              submitLabel="Reply"
              autoFocus
              onDone={() => setReplying(false)}
              onCancel={() => setReplying(false)}
            />
          )}
        </div>
      )}
      {!thread.deleted && !replying && (
        <button
          type="button"
          className="mt-2 ml-6 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setReplying(true)}
        >
          Reply
        </button>
      )}
    </div>
  );
}

function Comment({ comment }: { comment: RenderedComment }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteFetcher = useCommentFetcher(`delete-comment-${comment.id}`);
  const isDeleting = deleteFetcher.state !== "idle";

  if (comment.deleted) {
    return <p className="text-sm italic text-muted-foreground">[deleted]</p>;
  }

  const author = comment.author!;

  return (
    <article className={cn(isDeleting && "opacity-50")}>
      <header className="mb-1 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{author.name}</span>
        {author.badge && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            {author.badge === "admin" ? "Admin" : "Instructor"}
          </span>
        )}
        <span className="text-muted-foreground">
          {formatDate(comment.createdAt)}
          {comment.edited && " · edited"}
        </span>
      </header>

      {editing ? (
        <CommentForm
          fetcherKey={`edit-comment-${comment.id}`}
          intent="edit-comment"
          commentId={comment.id}
          defaultValue={comment.body ?? ""}
          submitLabel="Save"
          autoFocus
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div
          className="prose prose-sm prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: comment.bodyHtml ?? "" }}
        />
      )}

      {!editing && (comment.canEdit || comment.canDelete) && (
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {comment.canEdit && (
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
          {comment.canDelete &&
            (confirmingDelete ? (
              <deleteFetcher.Form
                method="post"
                className="flex items-center gap-2"
              >
                <input type="hidden" name="intent" value="delete-comment" />
                <input type="hidden" name="commentId" value={comment.id} />
                <span>Delete this comment?</span>
                <button
                  type="submit"
                  className="font-medium text-destructive"
                  disabled={isDeleting}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
              </deleteFetcher.Form>
            ) : (
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            ))}
        </div>
      )}
    </article>
  );
}

function CommentForm({
  fetcherKey,
  intent,
  parentId,
  commentId,
  defaultValue,
  placeholder,
  submitLabel,
  autoFocus,
  onDone,
  onCancel,
}: {
  fetcherKey: string;
  intent: "add-comment" | "edit-comment";
  parentId?: number;
  commentId?: number;
  defaultValue?: string;
  placeholder?: string;
  submitLabel: string;
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fetcher = useCommentFetcher(fetcherKey, () => {
    formRef.current?.reset();
    onDone?.();
  });
  const isSubmitting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" ref={formRef} className="space-y-2">
      <input type="hidden" name="intent" value={intent} />
      {parentId !== undefined && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      {commentId !== undefined && (
        <input type="hidden" name="commentId" value={commentId} />
      )}
      <Textarea
        name="body"
        required
        maxLength={MAX_COMMENT_LENGTH}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={isSubmitting}
        aria-label={submitLabel}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </fetcher.Form>
  );
}
