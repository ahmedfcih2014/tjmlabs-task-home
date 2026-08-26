# The brief
We need a small webhook relay service.
Callers register where they want events delivered. They then send us events. We reliably get each event to the places that asked for it.
That's the product. How you model it, shape the API, secure it, and make delivery dependable when the outside world misbehaves
is your call. Build something you'd be comfortable putting in front of real traffic.

---

## What the service should let people do
- Register a subscription — a caller tells us a destination and which event type(s) they care about, and gets back whatever
they'll need later.
- Send an event — a caller submits an event, and it reaches every subscription interested in that event type.
- See what happened — a caller can look at how a subscription's deliveries are doing.
And a few things a real relay has to get right, which we've left to you to design:
- Delivery should hold up when a destination is slow, down, or flaky.
- A receiver should be able to trust that a payload genuinely came from us and wasn't tampered with.
- Subscribers may hand us a credential to store — keep anything sensitive safe.

---

## Constraints
- Python + Django, with django-ninja for the HTTP API.
- uv for dependencies (pinned), pytest for tests. SQLite is fine.
- Keep the dependency list lean — reach for the standard library first.
Beyond that, the design is yours — decide what a good service needs and build it.

---

## What we're actually looking at
 We're less interested in whether you hit a checklist and more in how you think. The decisions you make, the trade-offs you can
name, and the things you build that we didn't spell out but a real service clearly needs — that's the signal.
In your README , tell us briefly: the key decisions you made and why, what you'd harden before production, and anything you
deliberately left out.

**AI tools are allowed** — we use them too. But you own every line, and we'll dig into your choices in the follow-up.
Have fun with it.