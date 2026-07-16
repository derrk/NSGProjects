"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, PackageCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toCents, formatUSD } from "@/lib/money";
import { recordGradingSubmitAction, recordGradingReturnAction } from "@/app/actions";

const COMPANIES = ["PSA", "CGC", "AGS", "TAG", "BGS", "Other"];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Send to PSA" — posts a GRADING_SUBMIT ledger transaction; fees fold into
 *  the card's cost basis. Same asset, same papertrail. */
export function SendToGrading({
  assetId,
  quantity,
  basisCents,
}: {
  assetId: string;
  quantity: number;
  basisCents: number; // per unit
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("PSA");
  const [serviceLevel, setServiceLevel] = useState("");
  const [date, setDate] = useState(today());
  const [expectedReturn, setExpectedReturn] = useState("");
  const [shipping, setShipping] = useState("");
  const [insurance, setInsurance] = useState("");
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");

  const feesCents = toCents(shipping) + toCents(insurance) + toCents(fee);
  const lotBasis = basisCents * quantity;
  const newUnitBasis = quantity > 0 ? Math.round((lotBasis + feesCents) / quantity) : basisCents;

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Award /> Send to grading
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="space-y-4 p-5">
        <div className="text-sm font-semibold">Send to grading</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="mb-1.5 block">Grading company</Label>
            <Select value={company} onChange={(e) => setCompany(e.target.value)}>
              {COMPANIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Service level</Label>
            <Input
              value={serviceLevel}
              placeholder="e.g. Value, Regular, Express"
              onChange={(e) => setServiceLevel(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Submission date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Expected return</Label>
            <Input
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Shipping ($)</Label>
            <Input type="number" step="0.01" value={shipping} placeholder="0.00" onChange={(e) => setShipping(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Insurance ($)</Label>
            <Input type="number" step="0.01" value={insurance} placeholder="0.00" onChange={(e) => setInsurance(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Grading fee ($)</Label>
            <Input type="number" step="0.01" value={fee} placeholder="0.00" onChange={(e) => setFee(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Notes</Label>
            <Input value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-md bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current cost basis</span>
            <span className="tnum">{formatUSD(basisCents)}/u</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Grading costs</span>
            <span className="tnum">+ {formatUSD(feesCents)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
            <span>New cost basis</span>
            <span className="tnum">{formatUSD(newUnitBasis)}/u</span>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await recordGradingSubmitAction({
                  assetId,
                  company,
                  serviceLevel: serviceLevel || null,
                  date: date || null,
                  expectedReturnAt: expectedReturn || null,
                  shippingCents: toCents(shipping),
                  insuranceCents: toCents(insurance),
                  feeCents: toCents(fee),
                  notes: notes || null,
                });
                if (!res.ok) setError(res.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Award />} Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** "Grading returned" — posts a GRADING_RETURN, sets grade/cert/market. */
export function GradingReturned({
  submissionId,
  company,
  marketCents,
}: {
  submissionId: string;
  company: string;
  marketCents: number; // per unit, current
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [date, setDate] = useState(today());
  const [newMarket, setNewMarket] = useState("");

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <PackageCheck /> Grading returned
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="space-y-4 p-5">
        <div className="text-sm font-semibold">Returned from {company}</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1.5 block">Grade</Label>
            <Input
              value={grade}
              placeholder={`e.g. ${company} 10`}
              onChange={(e) => setGrade(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Certification #</Label>
            <Input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Returned date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Market value now ($/u)</Label>
            <Input
              type="number"
              step="0.01"
              value={newMarket}
              placeholder={(marketCents / 100).toFixed(2)}
              onChange={(e) => setNewMarket(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Same card, new chapter — the grade and cert land on this asset and the papertrail keeps
          flowing. Update the listing in Collectr to the graded version, then re-import.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending || grade.trim() === ""}
            onClick={() =>
              startTransition(async () => {
                const res = await recordGradingReturnAction({
                  submissionId,
                  grade: grade.trim(),
                  certNumber: certNumber.trim() || null,
                  date: date || null,
                  newMarketValueCents: newMarket.trim() === "" ? null : toCents(newMarket),
                });
                if (!res.ok) setError(res.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />} Record return
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
