import { MessageSquareWarning, Star, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useStore } from "@/lib/store";

/** User Feedback & Complaints — live table over app_feedback. */
export function AdminFeedbackPanel() {
  const { db, setFeedbackStatus, deleteFeedback } = useStore();
  const rows = db.feedback;
  const pending = rows.filter((r) => r.status !== "Resolved").length;

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <MessageSquareWarning className="size-4 text-primary" /> User Feedback &amp; Complaints ({pending} pending)
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Rating</th>
                <th className="py-2 pr-3">Message</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("en-NG")}
                  </td>
                  <td className="py-2 pr-3">{r.name || "Anonymous"}</td>
                  <td className="py-2 pr-3 text-xs">{r.contact || "—"}</td>
                  <td className="py-2 pr-3"><Badge variant="outline">{r.category}</Badge></td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <Star className="size-3 fill-current" /> {r.rating}
                    </span>
                  </td>
                  <td className="max-w-72 py-2 pr-3 text-xs">{r.message}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={r.status === "Resolved" ? "default" : "destructive"}>{r.status}</Badge>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={r.status === "Resolved"}
                        onClick={async () => {
                          await setFeedbackStatus(r.id, "Resolved");
                          toast.success("Marked as resolved.");
                        }}
                      >
                        <CheckCircle2 className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Delete feedback"
                        onClick={async () => {
                          await deleteFeedback(r.id);
                          toast.success("Feedback deleted.");
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
