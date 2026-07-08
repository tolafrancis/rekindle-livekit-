import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { TranslateNowButton } from '@/components/TranslateNowButton';
import {
  BookOpen,
  Plus,
  Edit,
  Trash2,
  Search,
  Upload,
  Loader2,
  Eye,
  EyeOff,
  Headphones,
  FileText,
  X
} from 'lucide-react';

interface BookSummary {
  id: string;
  title: string;
  author: string;
  category: string;
  summary: string;
  key_takeaways: string[];
  cover_image_url: string;
  audio_url: string;
  pdf_url: string;
  is_published: boolean;
  created_at: string;
  updated_at?: string;
}

const FileUploadButton: React.FC<{
  accept: string;
  onUpload: (url: string) => void;
  folder: string;
  label: string;
  bucket?: string;
  disabled?: boolean;
}> = ({ accept, onUpload, folder, label, bucket = 'admin-content', disabled = false }) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileName = `${folder}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      onUpload(urlData.publicUrl);
      toast({ title: t('adminBookManager', 'success', 'Success'), description: t('adminBookManager', 'fileUploaded', 'File uploaded successfully') });
    } catch (err: any) {
      toast({ title: t('adminBookManager', 'uploadError', 'Upload Error'), description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleUpload}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || disabled}
      >
        <Upload className="h-4 w-4 mr-2" />
        {uploading ? t('adminBookManager', 'uploading', 'Uploading...') : label}
      </Button>
    </div>
  );
};

export const AdminBookManager: React.FC = () => {
  const { t } = useLanguage();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState<BookSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'published' | 'unpublished'>('all');

  const [formData, setFormData] = useState({
    title: '',
    author: '',
    category: 'Spiritual Growth',
    summary: '',
    key_takeaways: '',
    cover_image_url: '',
    audio_url: '',
    pdf_url: '',
    is_published: false
  });

  const categories = [
    'Spiritual Growth',
    'Prayer',
    'Faith',
    'Leadership',
    'Relationships',
    'Biography',
    'Theology',
    'Christian Living',
    'Ministry',
    'Revival'
  ];

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('book_summaries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBooks(data || []);
    } catch (err) {
      console.error('Error loading books:', err);
      toast({ title: t('adminBookManager', 'error', 'Error'), description: t('adminBookManager', 'failedLoadBooks', 'Failed to load books'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingBook(null);
    setFormData({
      title: '',
      author: '',
      category: 'Spiritual Growth',
      summary: '',
      key_takeaways: '',
      cover_image_url: '',
      audio_url: '',
      pdf_url: '',
      is_published: false
    });
    setShowModal(true);
  };

  const handleEdit = (book: BookSummary) => {
    setEditingBook(book);
    setFormData({
      title: book.title || '',
      author: book.author || '',
      category: book.category || 'Spiritual Growth',
      summary: book.summary || '',
      key_takeaways: Array.isArray(book.key_takeaways) 
        ? book.key_takeaways.join('\n') 
        : '',
      cover_image_url: book.cover_image_url || '',
      audio_url: book.audio_url || '',
      pdf_url: book.pdf_url || '',
      is_published: book.is_published || false
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.author || !formData.summary) {
      toast({ title: t('adminBookManager', 'validationError', 'Validation Error'), description: t('adminBookManager', 'fillRequiredFields', 'Please fill in all required fields'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Parse key takeaways
      const keyTakeaways = formData.key_takeaways
        .split('\n')
        .filter(item => item.trim())
        .map(item => item.trim());

      const dataToSave = {
        title: formData.title,
        author: formData.author,
        category: formData.category,
        summary: formData.summary,
        key_takeaways: keyTakeaways,
        cover_image_url: formData.cover_image_url,
        audio_url: formData.audio_url,
        pdf_url: formData.pdf_url,
        is_published: formData.is_published,
        updated_at: new Date().toISOString()
      };

      if (editingBook) {
        const { error } = await supabase
          .from('book_summaries')
          .update(dataToSave)
          .eq('id', editingBook.id);

        if (error) throw error;
        toast({ title: t('adminBookManager', 'success', 'Success'), description: t('adminBookManager', 'bookUpdated', 'Book updated successfully') });
      } else {
        const { error } = await supabase
          .from('book_summaries')
          .insert({
            ...dataToSave,
            created_at: new Date().toISOString()
          });

        if (error) throw error;
        toast({ title: t('adminBookManager', 'success', 'Success'), description: t('adminBookManager', 'bookCreated', 'Book created successfully') });
      }

      setShowModal(false);
      loadBooks();
    } catch (err: any) {
      console.error('Error saving book:', err);
      toast({ title: t('adminBookManager', 'error', 'Error'), description: err.message || t('adminBookManager', 'failedSaveBook', 'Failed to save book'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bookId: string) => {
    if (!confirm(t('adminBookManager', 'confirmDelete', 'Are you sure you want to delete this book summary?'))) return;

    try {
      const { error } = await supabase
        .from('book_summaries')
        .delete()
        .eq('id', bookId);

      if (error) throw error;
      toast({ title: t('adminBookManager', 'success', 'Success'), description: t('adminBookManager', 'bookDeleted', 'Book deleted successfully') });
      loadBooks();
    } catch (err: any) {
      console.error('Error deleting book:', err);
      toast({ title: t('adminBookManager', 'error', 'Error'), description: err.message || t('adminBookManager', 'failedDeleteBook', 'Failed to delete book'), variant: 'destructive' });
    }
  };

  const togglePublish = async (book: BookSummary) => {
    try {
      const { error } = await supabase
        .from('book_summaries')
        .update({ is_published: !book.is_published, updated_at: new Date().toISOString() })
        .eq('id', book.id);

      if (error) throw error;
      toast({
        title: t('adminBookManager', 'success', 'Success'),
        description: !book.is_published
          ? t('adminBookManager', 'bookPublished', 'Book published successfully')
          : t('adminBookManager', 'bookUnpublishedMsg', 'Book unpublished successfully')
      });
      loadBooks();
    } catch (err: any) {
      console.error('Error toggling publish:', err);
      toast({ title: t('adminBookManager', 'error', 'Error'), description: err.message || t('adminBookManager', 'failedUpdateBook', 'Failed to update book'), variant: 'destructive' });
    }
  };

  const filteredBooks = books
    .filter(book => {
      const matchesSearch = 
        book.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.category?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        selectedFilter === 'all' ? true :
        selectedFilter === 'published' ? book.is_published :
        !book.is_published;
      
      return matchesSearch && matchesFilter;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-600" />
            {t('adminBookManager', 'title', 'Book Summaries Manager')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminBookManager', 'searchBooks', 'Search books...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Select value={selectedFilter} onValueChange={(value: any) => setSelectedFilter(value)}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminBookManager', 'allBooks', 'All Books')}</SelectItem>
                  <SelectItem value="published">{t('adminBookManager', 'published', 'Published')}</SelectItem>
                  <SelectItem value="unpublished">{t('adminBookManager', 'unpublished', 'Unpublished')}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">
                <Plus className="h-4 w-4 mr-2" />
                {t('adminBookManager', 'addBook', 'Add Book')}
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {filteredBooks.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">{t('adminBookManager', 'noBooksFound', 'No books found')}</p>
              </div>
            ) : (
              filteredBooks.map((book) => (
                <Card key={book.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {/* Book Cover */}
                      <div className="w-24 h-32 flex-shrink-0 bg-gradient-to-br from-purple-700 to-blue-800 rounded-lg flex items-center justify-center overflow-hidden">
                        {book.cover_image_url ? (
                          <img
                            src={book.cover_image_url}
                            alt={book.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <BookOpen className="h-8 w-8 text-white/30" />
                        )}
                      </div>

                      {/* Book Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-lg mb-1 truncate">{book.title}</h3>
                            <p className="text-sm text-gray-600 mb-2">{t('adminBookManager', 'byAuthor', 'by {author}').replace('{author}', book.author || '')}</p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              <Badge variant="secondary" className="text-xs">
                                {book.category}
                              </Badge>
                              <Badge variant={book.is_published ? 'default' : 'outline'} className="text-xs">
                                {book.is_published ? t('adminBookManager', 'published', 'Published') : t('adminBookManager', 'draft', 'Draft')}
                              </Badge>
                              {book.audio_url && (
                                <Badge variant="outline" className="text-xs">
                                  <Headphones className="h-3 w-3 mr-1" />
                                  {t('adminBookManager', 'audio', 'Audio')}
                                </Badge>
                              )}
                              {book.pdf_url && (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="h-3 w-3 mr-1" />
                                  {t('adminBookManager', 'pdf', 'PDF')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2 mb-3">
                          {book.summary}
                        </p>
                        {book.key_takeaways && book.key_takeaways.length > 0 && (
                          <p className="text-xs text-gray-500 mb-3">
                            {book.key_takeaways.length} {book.key_takeaways.length !== 1 ? t('adminBookManager', 'keyTakeaways', 'key takeaways') : t('adminBookManager', 'keyTakeaway', 'key takeaway')}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(book)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            {t('adminBookManager', 'edit', 'Edit')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePublish(book)}
                            className={book.is_published ? 'text-orange-600' : 'text-green-600'}
                          >
                            {book.is_published ? (
                              <>
                                <EyeOff className="h-3 w-3 mr-1" />
                                {t('adminBookManager', 'unpublish', 'Unpublish')}
                              </>
                            ) : (
                              <>
                                <Eye className="h-3 w-3 mr-1" />
                                {t('adminBookManager', 'publish', 'Publish')}
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(book.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            {t('adminBookManager', 'delete', 'Delete')}
                          </Button>
                          <TranslateNowButton contentType="teaching" contentId={book.id} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBook ? t('adminBookManager', 'editBookSummary', 'Edit Book Summary') : t('adminBookManager', 'createBookSummary', 'Create Book Summary')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Title */}
            <div>
              <Label>{t('adminBookManager', 'titleLabel', 'Title *')}</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('adminBookManager', 'titlePlaceholder', 'The Purpose Driven Life')}
              />
            </div>

            {/* Author */}
            <div>
              <Label>{t('adminBookManager', 'authorLabel', 'Author *')}</Label>
              <Input
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                placeholder={t('adminBookManager', 'authorPlaceholder', 'Rick Warren')}
              />
            </div>

            {/* Category */}
            <div>
              <Label>{t('adminBookManager', 'categoryLabel', 'Category *')}</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Summary */}
            <div>
              <Label>{t('adminBookManager', 'summaryLabel', 'Summary *')}</Label>
              <Textarea
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                rows={6}
                placeholder={t('adminBookManager', 'summaryPlaceholder', "Enter a comprehensive summary...\n\n## Use ## for a bold subheading\nRegular paragraph text goes here.\n\n- Use a dash for bullet points")}
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports markdown: <code>## Subheading</code> (bold), <code>**bold**</code>, and <code>-</code> for bullets. Separate paragraphs with a blank line.
              </p>
            </div>

            {/* Key Takeaways */}
            <div>
              <Label>{t('adminBookManager', 'keyTakeawaysLabel', 'Key Takeaways')}</Label>
              <Textarea
                value={formData.key_takeaways}
                onChange={(e) => setFormData({ ...formData, key_takeaways: e.target.value })}
                rows={5}
                placeholder={t('adminBookManager', 'keyTakeawaysPlaceholder', '• First key insight\n• Second key insight\n• Third key insight')}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('adminBookManager', 'keyTakeawaysHelp', 'Enter one key takeaway per line. These will be displayed as bullet points.')}
              </p>
            </div>

            {/* Cover Image */}
            <div>
              <Label>{t('adminBookManager', 'coverImageLabel', 'Cover Image')}</Label>
              {formData.cover_image_url && (
                <div className="mb-2 relative">
                  <img
                    src={formData.cover_image_url}
                    alt={t('adminBookManager', 'coverPreviewAlt', 'Cover preview')}
                    className="w-32 h-44 object-cover rounded border"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 bg-white rounded-full shadow"
                    onClick={() => setFormData({ ...formData, cover_image_url: '' })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={formData.cover_image_url}
                  onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
                  placeholder="https://example.com/cover.jpg"
                />
                <FileUploadButton
                  accept="image/*"
                  folder="books/covers"
                  label={t('adminBookManager', 'upload', 'Upload')}
                  onUpload={(url) => setFormData({ ...formData, cover_image_url: url })}
                />
              </div>
            </div>

            {/* Audio URL */}
            <div>
              <Label>{t('adminBookManager', 'audioUrlLabel', 'Audio Summary URL')}</Label>
              {formData.audio_url && (
                <div className="mb-2">
                  <audio controls className="w-full" src={formData.audio_url} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData({ ...formData, audio_url: '' })}
                    className="mt-1"
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t('adminBookManager', 'removeAudio', 'Remove Audio')}
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={formData.audio_url}
                  onChange={(e) => setFormData({ ...formData, audio_url: e.target.value })}
                  placeholder="https://example.com/audio.mp3"
                />
                <FileUploadButton
                  accept="audio/*"
                  folder="books/audio"
                  label={t('adminBookManager', 'upload', 'Upload')}
                  onUpload={(url) => setFormData({ ...formData, audio_url: url })}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('adminBookManager', 'audioHelp', 'Optional: Upload an audio narration of the summary')}
              </p>
            </div>

            {/* PDF URL */}
            <div>
              <Label>{t('adminBookManager', 'pdfUrlLabel', 'PDF Summary URL')}</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.pdf_url}
                  onChange={(e) => setFormData({ ...formData, pdf_url: e.target.value })}
                  placeholder="https://example.com/summary.pdf"
                />
                <FileUploadButton
                  accept="application/pdf"
                  folder="books/pdfs"
                  label={t('adminBookManager', 'upload', 'Upload')}
                  onUpload={(url) => setFormData({ ...formData, pdf_url: url })}
                />
              </div>
              {formData.pdf_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, pdf_url: '' })}
                  className="mt-1"
                >
                  <X className="h-4 w-4 mr-1" />
                  {t('adminBookManager', 'removePdf', 'Remove PDF')}
                </Button>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {t('adminBookManager', 'pdfHelp', 'Optional: Upload a PDF version of the summary')}
              </p>
            </div>

            {/* Publish Toggle */}
            <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.is_published}
                onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
              />
              <div>
                <Label>{t('adminBookManager', 'publishToFrontend', 'Publish to Frontend')}</Label>
                <p className="text-xs text-gray-500">
                  {formData.is_published
                    ? t('adminBookManager', 'visibleToUsers', 'This book will be visible to users')
                    : t('adminBookManager', 'savedAsDraft', 'This book will be saved as draft')}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              className="w-full sm:w-auto"
            >
              {t('adminBookManager', 'cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminBookManager', 'saving', 'Saving...')}
                </>
              ) : (
                t('adminBookManager', 'saveBook', 'Save Book')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
