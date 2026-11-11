'use client';

import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import {
  addOption,
  addQuestion,
  canMove,
  conditionValuesOf,
  isChoiceType,
  moveQuestion,
  OFFERED_TYPES,
  QUESTION_LIMITS,
  QUESTION_TYPE_LABELS,
  questionName,
  removeOption,
  removeQuestion,
  renameOption,
  setCondition,
  setType,
  sourceCandidates,
  updateQuestion,
  validateQuestions,
  type AuthoringResult,
  type QuestionIssue,
  type QuestionType,
} from '@/lib/invitation/question-authoring';
import type { CustomQuestion } from '@/lib/invitation/rsvp-questions';
import { cn } from '@/lib/utils';

const input =
  'mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-rose-500';
const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

type Props = {
  questions: CustomQuestion[];
  onChange: (next: CustomQuestion[]) => void;
  /** After a save attempt: show what still blocks saving next to each field. */
  showIssues: boolean;
};

/**
 * The host's custom questions (E-031): wording, answer type, "required for guests who attend", choices, a condition on an
 * earlier choice question, order and removal. Every edit goes through `question-authoring.ts`, which keeps conditions
 * valid and reports what an edit changed elsewhere; the guest page shows every question with its condition in words.
 */
export function QuestionEditor({ questions, onChange, showIssues }: Props) {
  const [notes, setNotes] = useState<string[]>([]);
  const baseId = useId();
  const issues = showIssues ? validateQuestions(questions) : [];
  const apply = (result: AuthoringResult) => {
    setNotes(result.notes);
    onChange(result.questions);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-bold text-slate-900">Pertanyaan untuk tamu</h4>
        <p className="text-xs leading-5 text-slate-500">
          Tampil di form RSVP, berurutan dari atas. Pertanyaan bersyarat tetap terlihat dengan keterangan syaratnya; jawabannya hanya
          disimpan bila syarat terpenuhi. &quot;Wajib&quot; berlaku untuk tamu yang menjawab hadir.
        </p>
      </div>

      {questions.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Belum ada pertanyaan.</p>}

      <ol className="flex flex-col gap-3">
        {questions.map((question, index) => (
          <li key={question.id}>
            <QuestionCard
              baseId={`${baseId}-${question.id}`}
              index={index}
              question={question}
              questions={questions}
              issues={issues.filter((issue) => issue.index === index)}
              apply={apply}
            />
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => apply(addQuestion(questions))}
          disabled={questions.length >= QUESTION_LIMITS.questions}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Tambah pertanyaan
        </button>
        <span className="text-xs text-slate-500">
          {questions.length} dari {QUESTION_LIMITS.questions} pertanyaan
        </span>
      </div>

      <div aria-live="polite" className="flex flex-col gap-1">
        {notes.map((note) => (
          <p key={note} className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}

function IssueText({ id, issue }: { id: string; issue?: QuestionIssue }) {
  if (!issue) return null;
  return (
    <span id={id} className="mt-1 block text-xs font-semibold text-rose-700">
      {issue.message}
    </span>
  );
}

function QuestionCard({
  baseId,
  index,
  question,
  questions,
  issues,
  apply,
}: {
  baseId: string;
  index: number;
  question: CustomQuestion;
  questions: CustomQuestion[];
  issues: QuestionIssue[];
  apply: (result: AuthoringResult) => void;
}) {
  const number = index + 1;
  const issueOf = (field: QuestionIssue['field']) => issues.find((issue) => issue.field === field);
  const labelIssue = issueOf('label');
  const optionsIssue = issueOf('options');
  const conditionIssue = issueOf('conditional');
  const candidates = sourceCandidates(questions, index);
  const source = candidates.find((candidate) => candidate.id === question.conditional?.questionId);
  const values = conditionValuesOf(question);
  const types: QuestionType[] = question.type === 'multiselect' ? [...OFFERED_TYPES, 'multiselect'] : [...OFFERED_TYPES];

  return (
    <div role="group" aria-labelledby={`${baseId}-title`} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p id={`${baseId}-title`} className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Pertanyaan {number}
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" className={iconButton} aria-label={`Naikkan pertanyaan ${number}`} disabled={!canMove(questions, index, -1)} onClick={() => apply(moveQuestion(questions, index, -1))}>
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label={`Turunkan pertanyaan ${number}`} disabled={!canMove(questions, index, 1)} onClick={() => apply(moveQuestion(questions, index, 1))}>
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label={`Hapus pertanyaan ${number}`} onClick={() => apply(removeQuestion(questions, index))}>
            <Trash2 className="h-4 w-4 text-rose-600" aria-hidden />
          </button>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">Pertanyaan</span>
        <input
          className={input}
          value={question.label}
          maxLength={QUESTION_LIMITS.label}
          dir="auto"
          placeholder="Misalnya: Pilihan menu"
          aria-invalid={labelIssue ? true : undefined}
          aria-describedby={labelIssue ? `${baseId}-label-issue` : undefined}
          onChange={(event) => apply(updateQuestion(questions, index, { label: event.target.value }))}
        />
        <IssueText id={`${baseId}-label-issue`} issue={labelIssue} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Jenis jawaban</span>
          <select className={input} value={question.type} onChange={(event) => apply(setType(questions, index, event.target.value as QuestionType))}>
            {types.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={question.required}
            onChange={(event) => apply(updateQuestion(questions, index, { required: event.target.checked }))}
          />
          Wajib diisi tamu yang hadir
        </label>
      </div>

      {isChoiceType(question.type) && (
        <fieldset className="flex flex-col gap-2" aria-describedby={optionsIssue ? `${baseId}-options-issue` : undefined}>
          <legend className="mb-1 text-xs font-semibold text-slate-700">Pilihan jawaban</legend>
          {(question.options ?? []).map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <input
                className={cn(input, 'mt-0')}
                value={option}
                maxLength={QUESTION_LIMITS.option}
                dir="auto"
                aria-label={`Pilihan ${optionIndex + 1} untuk pertanyaan ${number}`}
                aria-invalid={optionsIssue && !option.trim() ? true : undefined}
                onChange={(event) => apply(renameOption(questions, index, optionIndex, event.target.value))}
              />
              <button
                type="button"
                className={iconButton}
                aria-label={`Hapus pilihan ${optionIndex + 1} dari pertanyaan ${number}`}
                disabled={(question.options ?? []).length <= 1}
                onClick={() => apply(removeOption(questions, index, optionIndex))}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => apply(addOption(questions, index))}
            className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Tambah pilihan
          </button>
          <IssueText id={`${baseId}-options-issue`} issue={optionsIssue} />
        </fieldset>
      )}

      {index > 0 && (candidates.length > 0 || question.conditional) && (
        <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Ditanyakan kepada</span>
            <select
              className={input}
              value={question.conditional?.questionId ?? ''}
              aria-invalid={conditionIssue ? true : undefined}
              aria-describedby={conditionIssue ? `${baseId}-condition-issue` : undefined}
              onChange={(event) => apply(setCondition(questions, index, event.target.value || null))}
            >
              <option value="">Semua tamu</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  Tamu yang menjawab {questionName(candidate)}
                </option>
              ))}
              {question.conditional && !source && <option value={question.conditional.questionId}>Syarat lama tidak berlaku lagi, pilih ulang</option>}
            </select>
          </label>
          {source && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs font-semibold text-slate-700">Jawaban yang membuat pertanyaan ini dihitung</legend>
              {(source.options ?? [])
                .filter((option) => option.trim())
                .map((option) => (
                  <label key={option} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={values.includes(option)}
                      onChange={(event) =>
                        apply(setCondition(questions, index, source.id, event.target.checked ? [...values, option] : values.filter((value) => value !== option)))
                      }
                    />
                    <span dir="auto">{option}</span>
                  </label>
                ))}
            </fieldset>
          )}
          <IssueText id={`${baseId}-condition-issue`} issue={conditionIssue} />
        </div>
      )}
    </div>
  );
}
