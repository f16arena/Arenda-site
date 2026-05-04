"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"

function SectionSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="space-y-3">
        <div className="h-9 rounded bg-slate-100 dark:bg-slate-800/70" />
        <div className="h-9 rounded bg-slate-100 dark:bg-slate-800/70" />
      </div>
    </div>
  )
}

const RequisitesForm = dynamic(() => import("./requisites-form").then((mod) => mod.RequisitesForm), {
  ssr: false,
  loading: () => <SectionSkeleton />,
})
const RentalTermsForm = dynamic(() => import("./rental-terms-form").then((mod) => mod.RentalTermsForm), {
  ssr: false,
  loading: () => <SectionSkeleton />,
})
const ServiceChargesForm = dynamic(() => import("./service-charges-form").then((mod) => mod.ServiceChargesForm), {
  ssr: false,
  loading: () => <SectionSkeleton />,
})
const DocumentsActions = dynamic(() => import("./documents-actions").then((mod) => mod.DocumentsActions), {
  ssr: false,
  loading: () => <SectionSkeleton />,
})
const EmailLog = dynamic(() => import("./email-log").then((mod) => mod.EmailLog), {
  ssr: false,
  loading: () => <SectionSkeleton />,
})
const DocumentsChecklist = dynamic(() => import("./documents-checklist").then((mod) => mod.DocumentsChecklist), {
  ssr: false,
  loading: () => <SectionSkeleton />,
})
const FullFloorAssign = dynamic(() => import("./full-floor-assign").then((mod) => mod.FullFloorAssign), {
  ssr: false,
  loading: () => <SectionSkeleton />,
})

export function RequisitesFormLoader(props: ComponentProps<typeof RequisitesForm>) {
  return <RequisitesForm {...props} />
}

export function RentalTermsFormLoader(props: ComponentProps<typeof RentalTermsForm>) {
  return <RentalTermsForm {...props} />
}

export function ServiceChargesFormLoader(props: ComponentProps<typeof ServiceChargesForm>) {
  return <ServiceChargesForm {...props} />
}

export function DocumentsActionsLoader(props: ComponentProps<typeof DocumentsActions>) {
  return <DocumentsActions {...props} />
}

export function EmailLogLoader(props: ComponentProps<typeof EmailLog>) {
  return <EmailLog {...props} />
}

export function DocumentsChecklistLoader(props: ComponentProps<typeof DocumentsChecklist>) {
  return <DocumentsChecklist {...props} />
}

export function FullFloorAssignLoader(props: ComponentProps<typeof FullFloorAssign>) {
  return <FullFloorAssign {...props} />
}
