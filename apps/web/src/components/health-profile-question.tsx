'use client';

import { useState } from 'react';
import type { HealthProfileQuestionKey, HealthProfileUpdateInput } from '@aidoctor/shared';
import { BLOOD_GROUPS, DIET_TYPES, EXERCISE_LEVELS, GENDERS } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BLOOD_GROUP_LABELS,
  DIET_TYPE_LABELS,
  EXERCISE_LEVEL_LABELS,
  GENDER_LABELS,
} from '@/lib/health-profile/labels';
import type { HealthProfileRecord } from '@/lib/health-profile/use-health-profile';
import { cn } from '@/lib/utils';

interface Props {
  questionKey: HealthProfileQuestionKey;
  /** Existing profile, if any — supplies the prefill when Back revisits an already-answered question. */
  profile: HealthProfileRecord | null;
  isSubmitting: boolean;
  onSubmit: (patch: HealthProfileUpdateInput) => void;
}

function NumberQuestion({
  field,
  unit,
  min,
  max,
  step,
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  field: 'age' | 'heightCm' | 'weightKg' | 'sleepHours';
  unit: string;
  min: number;
  max: number;
  step?: number;
  initialValue: number | null;
  isSubmitting: boolean;
  onSubmit: (patch: HealthProfileUpdateInput) => void;
}) {
  const [value, setValue] = useState(initialValue !== null ? String(initialValue) : '');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const num = Number(value);
        if (Number.isFinite(num)) onSubmit({ [field]: num } as HealthProfileUpdateInput);
      }}
    >
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 1}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={unit}
        className="h-12 max-w-40 text-lg"
      />
      <Button size="lg" type="submit" disabled={!value || isSubmitting}>
        Continue
      </Button>
    </form>
  );
}

function ChoiceQuestion({
  field,
  options,
  labels,
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  field: 'gender' | 'bloodGroup' | 'exerciseLevel' | 'dietType';
  options: readonly string[];
  labels: Record<string, string>;
  initialValue: string | null;
  isSubmitting: boolean;
  onSubmit: (patch: HealthProfileUpdateInput) => void;
}) {
  const [value, setValue] = useState<string>(initialValue ?? '');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onSubmit({ [field]: value } as HealthProfileUpdateInput);
      }}
    >
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const isActive = value === option;
          return (
            <button
              key={option}
              type="button"
              disabled={isSubmitting}
              onClick={() => setValue(option)}
              className={cn(
                'cursor-pointer rounded-lg border px-4 py-3 text-left text-base transition-colors disabled:cursor-not-allowed',
                isActive ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
              )}
            >
              {labels[option] ?? option}
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

function BooleanQuestion({
  field,
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  field: 'smoking' | 'alcohol';
  initialValue: boolean | null;
  isSubmitting: boolean;
  onSubmit: (patch: HealthProfileUpdateInput) => void;
}) {
  return (
    <div className="flex gap-3">
      <Button
        size="lg"
        type="button"
        variant={initialValue === true ? 'default' : 'outline'}
        disabled={isSubmitting}
        onClick={() => onSubmit({ [field]: true } as HealthProfileUpdateInput)}
      >
        Yes
      </Button>
      <Button
        size="lg"
        type="button"
        variant={initialValue === false ? 'default' : 'outline'}
        disabled={isSubmitting}
        onClick={() => onSubmit({ [field]: false } as HealthProfileUpdateInput)}
      >
        No
      </Button>
    </div>
  );
}

function TagListQuestion({
  field,
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  field: 'existingConditions' | 'medications' | 'allergies';
  initialValue: string[];
  isSubmitting: boolean;
  onSubmit: (patch: HealthProfileUpdateInput) => void;
}) {
  const [value, setValue] = useState(initialValue.join(', '));
  const submit = (raw: string) => {
    const items = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({ [field]: items } as HealthProfileUpdateInput);
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Separate multiple with commas"
        className="h-12 max-w-80 text-lg"
      />
      <Button size="lg" type="submit" disabled={isSubmitting}>
        Continue
      </Button>
      <Button size="lg" type="button" variant="ghost" disabled={isSubmitting} onClick={() => submit('')}>
        Skip
      </Button>
    </form>
  );
}

function EmergencyContactQuestion({
  initialValue,
  isSubmitting,
  onSubmit,
}: {
  initialValue: { name: string; relationship: string; phone: string };
  isSubmitting: boolean;
  onSubmit: (patch: HealthProfileUpdateInput) => void;
}) {
  const [name, setName] = useState(initialValue.name);
  const [relationship, setRelationship] = useState(initialValue.relationship);
  const [phone, setPhone] = useState(initialValue.phone);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name && relationship && phone) {
          onSubmit({ emergencyContact: { name, relationship, phone } });
        }
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-12 text-lg" />
      <Input
        value={relationship}
        onChange={(e) => setRelationship(e.target.value)}
        placeholder="Relationship"
        className="h-12 text-lg"
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number"
        type="tel"
        className="h-12 text-lg"
      />
      <Button size="lg" type="submit" className="w-fit" disabled={!name || !relationship || !phone || isSubmitting}>
        Finish
      </Button>
    </form>
  );
}

export function HealthProfileQuestion({ questionKey, profile, isSubmitting, onSubmit }: Props) {
  switch (questionKey) {
    case 'age':
      return (
        <NumberQuestion
          field="age"
          unit="Age"
          min={18}
          max={120}
          initialValue={profile?.age ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'heightCm':
      return (
        <NumberQuestion
          field="heightCm"
          unit="cm"
          min={30}
          max={272}
          initialValue={profile?.heightCm ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'weightKg':
      return (
        <NumberQuestion
          field="weightKg"
          unit="kg"
          min={2}
          max={400}
          initialValue={profile?.weightKg ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'sleepHours':
      return (
        <NumberQuestion
          field="sleepHours"
          unit="hours"
          min={0}
          max={24}
          step={0.5}
          initialValue={profile?.sleepHours ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'gender':
      return (
        <ChoiceQuestion
          field="gender"
          options={GENDERS}
          labels={GENDER_LABELS}
          initialValue={profile?.gender ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'bloodGroup':
      return (
        <ChoiceQuestion
          field="bloodGroup"
          options={BLOOD_GROUPS}
          labels={BLOOD_GROUP_LABELS}
          initialValue={profile?.bloodGroup ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'exerciseLevel':
      return (
        <ChoiceQuestion
          field="exerciseLevel"
          options={EXERCISE_LEVELS}
          labels={EXERCISE_LEVEL_LABELS}
          initialValue={profile?.exerciseLevel ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'dietType':
      return (
        <ChoiceQuestion
          field="dietType"
          options={DIET_TYPES}
          labels={DIET_TYPE_LABELS}
          initialValue={profile?.dietType ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'smoking':
      return (
        <BooleanQuestion
          field="smoking"
          initialValue={profile?.smoking ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'alcohol':
      return (
        <BooleanQuestion
          field="alcohol"
          initialValue={profile?.alcohol ?? null}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'existingConditions':
      return (
        <TagListQuestion
          field="existingConditions"
          initialValue={profile?.existingConditions ?? []}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'medications':
      return (
        <TagListQuestion
          field="medications"
          initialValue={profile?.medications ?? []}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'allergies':
      return (
        <TagListQuestion
          field="allergies"
          initialValue={profile?.allergies ?? []}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    case 'emergencyContact':
      return (
        <EmergencyContactQuestion
          initialValue={{
            name: profile?.emergencyContactName ?? '',
            relationship: profile?.emergencyContactRelationship ?? '',
            phone: profile?.emergencyContactPhone ?? '',
          }}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      );
    default:
      return null;
  }
}
