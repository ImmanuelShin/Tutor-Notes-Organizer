import { useState } from "react";
import type { Student } from "../types";
import { parseTags, serializeTags } from "../lib/format";
import { Modal, TagInput } from "./ui";

export type StudentInfoPatch = {
  name: string;
  subject: string;
  level: string;
  contact: string;
  tags: string;
};

export function StudentInfoModal({
  student,
  onClose,
  onSave,
}: {
  student: Student;
  onClose: () => void;
  onSave: (patch: StudentInfoPatch) => Promise<void>;
}) {
  const [name, setName] = useState(student.name);
  const [subject, setSubject] = useState(student.subject);
  const [level, setLevel] = useState(student.level);
  const [contact, setContact] = useState(student.contact);
  const [tags, setTags] = useState(parseTags(student.tags));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        subject: subject.trim(),
        level: level.trim(),
        contact: contact.trim(),
        tags: serializeTags(tags),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit student" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm">
          Name
          <input
            className="field mt-1"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
        </label>
        <label className="block text-sm">
          Subject / course
          <input
            className="field mt-1"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
        </label>
        <label className="block text-sm">
          Level
          <input
            className="field mt-1"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
        </label>
        <label className="block text-sm">
          Contact
          <input
            className="field mt-1"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
        </label>
        <div className="text-sm">
          Tags
          <div className="mt-1">
            <TagInput value={tags} onChange={setTags} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!name.trim() || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
