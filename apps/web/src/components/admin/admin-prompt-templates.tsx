'use client';

import { useState } from 'react';
import type { AdminPromptTemplateDto } from '@aidoctor/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { useUpdateAdminPromptTemplate } from '@/lib/admin/use-admin';

function PromptTemplateCard({ template }: { template: AdminPromptTemplateDto }) {
  const [draft, setDraft] = useState(template.systemPrompt);
  const updateTemplate = useUpdateAdminPromptTemplate();
  const isDirty = draft !== template.systemPrompt;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{template.key}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={template.isActive ? 'good' : 'outline'}>
              {template.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={updateTemplate.isPending}
              onClick={() => updateTemplate.mutate({ id: template.id, input: { isActive: !template.isActive } })}
            >
              {template.isActive ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="font-mono text-xs"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!isDirty || updateTemplate.isPending}
            onClick={() => updateTemplate.mutate({ id: template.id, input: { systemPrompt: draft } })}
          >
            {updateTemplate.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {isDirty ? (
            <Button variant="ghost" size="sm" onClick={() => setDraft(template.systemPrompt)}>
              Discard
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminPromptTemplates({ templates }: { templates: AdminPromptTemplateDto[] }) {
  if (templates.length === 0) {
    return <EmptyState message="No prompt templates configured." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {templates.map((template) => (
        <PromptTemplateCard key={template.id} template={template} />
      ))}
    </div>
  );
}
