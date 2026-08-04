"use client";

import { motion } from "motion/react";

const PLANS = [
  {
    name: "Starter",
    price: "0",
    tag: "Free forever",
    body: "For small teams testing the waters.",
    cta: "Get started",
    features: [
      "Up to 5 members",
      "Unlimited channels & DMs",
      "1 kanban board",
      "Cleotilda AI · 20 calls/day",
      "7-day message history",
    ],
    highlight: false,
  },
  {
    name: "Team",
    price: "9",
    unit: "per user / month",
    tag: "Most popular",
    body: "For teams that ship things weekly.",
    cta: "Start 14-day trial",
    features: [
      "Unlimited members",
      "Unlimited boards & channels",
      "Cleotilda AI · unlimited",
      "Full message history",
      "Guest members",
      "Priority support",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "annual only",
    tag: "Compliance-ready",
    body: "For orgs that need SSO, audit logs, SLA.",
    cta: "Talk to us",
    features: [
      "SSO / SAML",
      "SOC-2 report",
      "Dedicated infra",
      "99.9% SLA",
      "Custom retention policies",
      "Onboarding manager",
    ],
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Pricing
          </p>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl"
          >
            Simple pricing.{" "}
            <span className="landing-text-gradient-hot">No seat games.</span>
          </motion.h2>
          <p className="mt-5 text-lg text-[#b0b0c8]">
            Start free. Upgrade when your team&apos;s ready. Cancel anytime.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                delay: i * 0.08,
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={`relative flex flex-col rounded-3xl p-6 lg:p-7 ${
                p.highlight
                  ? "landing-pricing-featured border-2 border-indigo-400/60 bg-gradient-to-b from-indigo-500/[0.14] to-[#10101c] shadow-2xl shadow-indigo-500/20"
                  : "border border-white/10 bg-white/[0.02]"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-500/40">
                  {p.tag}
                </span>
              )}
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#9494a8]">
                  {p.name}
                </p>
                <div className="mt-3 flex items-baseline gap-1">
                  {p.price === "Custom" ? (
                    <span className="text-4xl font-extrabold tracking-tight text-white">
                      Custom
                    </span>
                  ) : (
                    <>
                      <span className="text-lg font-bold text-[#9494a8]">
                        $
                      </span>
                      <span className="text-5xl font-extrabold tracking-tight text-white">
                        {p.price}
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#6d6d82]">
                  {p.unit ?? p.tag}
                </p>
                <p className="mt-4 text-sm text-[#b0b0c8]">{p.body}</p>
              </div>

              <a
                href="#cta"
                className={
                  p.highlight ? "landing-btn-primary" : "landing-btn-ghost"
                }
              >
                {p.cta}
              </a>

              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-sm text-[#e0e0f0]"
                  >
                    <span
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                        p.highlight
                          ? "bg-gradient-to-br from-indigo-500 to-cyan-400"
                          : "bg-white/10"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-2.5 w-2.5 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
