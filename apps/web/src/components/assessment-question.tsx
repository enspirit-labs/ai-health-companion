'use client';

import { useState } from 'react';
import type { QuestionnaireQuestionDto } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type AnswerValue = string | number | boolean | string[];

interface Props {
  question: QuestionnaireQuestionDto;
  /** The existing answer, when re-visiting an already-answered question via Back — prefills instead of starting blank. */
  value?: AnswerValue;
  isSubmitting: boolean;
  onSubmit: (answer: AnswerValue) => void;
}

export function AssessmentQuestion({ question, value, isSubmitting, onSubmit }: Props) {
  switch (question.inputType) {
    case 'TEXT':
      return (
        <TextAnswer
          initialValue={typeof value === 'string' ? value : ''}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'NUMBER':
      return (
        <NumberAnswer
          initialValue={typeof value === 'number' ? String(value) : ''}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'BOOLEAN':
      return (
        <BooleanAnswer
          value={typeof value === 'boolean' ? value : undefined}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'SINGLE_CHOICE':
      return (
        <SingleChoiceAnswer
          options={question.options ?? []}
          initialValue={typeof value === 'string' ? value : ''}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'MULTI_CHOICE':
      return (
        <MultiChoiceAnswer
          options={question.options ?? []}
          initialValue={Array.isArray(value) ? value : []}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'SCALE':
      return (
        <ScaleAnswer
          value={typeof value === 'number' ? value : undefined}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    default:
      return null;
  }
}

function TextAnswer({
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  initialValue: string;
  isSubmitting: boolean;
  onSubmit: Props['onSubmit'];
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 max-w-96 text-lg"
      />
      <Button size="lg" type="submit" disabled={!value.trim() || isSubmitting}>
        Continue
      </Button>
    </form>
  );
}

function NumberAnswer({
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  initialValue: string;
  isSubmitting: boolean;
  onSubmit: Props['onSubmit'];
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const num = Number(value);
        if (Number.isFinite(num)) onSubmit(num);
      }}
    >
      <Input
        type="number"
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 max-w-40 text-lg"
      />
      <Button size="lg" type="submit" disabled={!value || isSubmitting}>
        Continue
      </Button>
    </form>
  );
}

function BooleanAnswer({
  value,
  isSubmitting,
  onSubmit,
}: {
  value?: boolean;
  isSubmitting: boolean;
  onSubmit: Props['onSubmit'];
}) {
  return (
    <div className="flex gap-3">
      <Button
        size="lg"
        type="button"
        variant={value === true ? 'default' : 'outline'}
        disabled={isSubmitting}
        onClick={() => onSubmit(true)}
      >
        Yes
      </Button>
      <Button
        size="lg"
        type="button"
        variant={value === false ? 'default' : 'outline'}
        disabled={isSubmitting}
        onClick={() => onSubmit(false)}
      >
        No
      </Button>
    </div>
  );
}

function SingleChoiceAnswer({
  options,
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  options: Array<{ value: string; label: string }>;
  initialValue: string;
  isSubmitting: boolean;
  onSubmit: Props['onSubmit'];
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onSubmit(value);
      }}
    >
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={isSubmitting}
              onClick={() => setValue(option.value)}
              className={cn(
                'cursor-pointer rounded-lg border px-4 py-3 text-left text-base transition-colors disabled:cursor-not-allowed',
                isActive ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <Button size="lg" type="submit" className="w-fit" disabled={!value || isSubmitting}>
        Continue
      </Button>
    </form>
  );
}

function MultiChoiceAnswer({
  options,
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  options: Array<{ value: string; label: string }>;
  initialValue: string[];
  isSubmitting: boolean;
  onSubmit: Props['onSubmit'];
}) {
  const [selected, setSelected] = useState<string[]>(initialValue);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(selected);
      }}
    >
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={isSubmitting}
              onClick={() =>
                setSelected((prev) =>
                  isActive ? prev.filter((v) => v !== option.value) : [...prev, option.value],
                )
              }
              className={cn(
                'cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed',
                isActive ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <Button size="lg" type="submit" className="w-fit" disabled={isSubmitting}>
        Continue
      </Button>
    </form>
  );
}

function ScaleAnswer({
  value,
  isSubmitting,
  onSubmit,
}: {
  value?: number;
  isSubmitting: boolean;
  onSubmit: Props['onSubmit'];
}) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <Button
          key={n}
          size="lg"
          type="button"
          variant={value === n ? 'default' : 'outline'}
          disabled={isSubmitting}
          onClick={() => onSubmit(n)}
        >
          {n}
        </Button>
      ))}
    </div>
  );
}
