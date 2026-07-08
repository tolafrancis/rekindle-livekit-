import React, { useState } from 'react';
import { bibleBooks } from '@/data/bible';
import { bibleVersions, getVerseText } from '@/data/bibleVerses';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Book, Plus, X } from 'lucide-react';

export interface ScriptureReference {
  reference: string;
  version: string;
  text: string;
}

interface ScriptureSelectorProps {
  onSelect: (scripture: ScriptureReference) => void;
  selectedReferences: ScriptureReference[];
  onRemove: (reference: string) => void;
}

export const ScriptureSelector: React.FC<ScriptureSelectorProps> = ({ onSelect, selectedReferences, onRemove }) => {
  const [book, setBook] = useState('');
  const [chapter, setChapter] = useState('');
  const [verses, setVerses] = useState('');
  const [version, setVersion] = useState('KJV');

  const selectedBook = bibleBooks.find(b => b.name === book);
  const chapters = selectedBook ? Array.from({ length: selectedBook.chapters }, (_, i) => i + 1) : [];

  const handleAdd = () => {
    if (!book || !chapter) return;
    const ref = verses ? `${book} ${chapter}:${verses}` : `${book} ${chapter}`;
    if (!selectedReferences.find(s => s.reference === ref)) {
      const text = getVerseText(ref, version);
      onSelect({ reference: ref, version, text });
    }
    setVerses('');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {selectedReferences.map(s => (
          <div key={s.reference} className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm font-medium">
                <Book className="h-3 w-3" />{s.reference} ({s.version})
              </span>
              <button onClick={() => onRemove(s.reference)} className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-gray-700 italic">"{s.text}"</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={book} onValueChange={v => { setBook(v); setChapter(''); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Book" /></SelectTrigger>
          <SelectContent className="max-h-60">{bibleBooks.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={chapter} onValueChange={setChapter} disabled={!book}>
          <SelectTrigger className="w-20"><SelectValue placeholder="Ch." /></SelectTrigger>
          <SelectContent className="max-h-60">{chapters.map(c => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Verses" value={verses} onChange={e => setVerses(e.target.value)} className="w-24" />
        <Select value={version} onValueChange={setVersion}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {bibleVersions.map(v => (
              <SelectItem key={v.id} value={v.abbreviation}>{v.abbreviation}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} disabled={!book || !chapter} size="icon"><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};
