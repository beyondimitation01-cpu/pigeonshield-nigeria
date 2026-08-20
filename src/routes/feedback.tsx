import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Star, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { FEEDBACK_CATEGORIES } from "@/lib/pigeon-data";
import { canonicalUrl } from "@/lib/site";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback & Complaints — PigeonShield Nigeria" },
      {
        name: "description",
        content:
          "Report a bug, suggest a feature, rate the app or file a complaint about a PigeonShield escrow trade.",
      },
      { property: "og:title", content: "Feedback & Complaints — PigeonShield Nigeria" },
      { property: "og:description", content: "Tell the PigeonShield team what to fix or build next." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/feedback") }],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user, submitFeedback } = useStore();
  const [name, setName] = useState(user?.public_handle ?? "");
  const [contact, setContact] = useState(user?.phone_number ?? "");
  const [category, setCategory] = useState<string>(FEEDBACK_CATEGORIES[0]);
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await submitFeedback({ name, contact, category, rating, message });
    setBusy(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success("Thank you — your feedback reached the admin desk.");
    setMessage("");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-primary">Feedback &amp; Complaints</h1>
      <p className="mt-1 text-muted-foreground">
        Bugs, ideas, complaints or a quick app review — the admin team reads every entry.
      </p>

      <Card className="mt-8 p-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fb-name">Name</Label>
              <Input id="fb-name" value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-contact">Email / Phone number</Label>
              <Input
                id="fb-contact"
                value={contact}
                maxLength={160}
                required
                onChange={(e) => setContact(e.target.value)}
                placeholder="08031234567 or you@email.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Star rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onClick={() => setRating(n)}
                  className="p-1"
                >
                  <Star className={`size-6 ${n <= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-message">Message</Label>
            <Textarea
              id="fb-message"
              rows={5}
              required
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us exactly what happened, including the listing or order reference."
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            <Send className="size-4" /> {busy ? "Sending…" : "Send feedback"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
