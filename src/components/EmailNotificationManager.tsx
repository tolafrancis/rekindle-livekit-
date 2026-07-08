import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Mail, Send, Eye, Edit, Trash2, Plus, Save, X, 
  Users, CheckCircle, AlertCircle, Copy, Loader2
} from 'lucide-react';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  email_type: string;
  created_at: string;
  updated_at: string;
}

const defaultTemplates = {
  welcome: {
    name: 'Welcome Email',
    subject: 'Welcome to ReKindle, {{userName}}!',
    html_content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%); color: white; padding: 40px 30px; text-align: center; }
    .content { padding: 40px 30px; }
    .button { display: inline-block; padding: 12px 30px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f9f9f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ReKindle!</h1>
    </div>
    <div class="content">
      <h2>Hi {{userName}},</h2>
      <p>We're thrilled to have you join our spiritual community. Your journey of faith and growth starts here!</p>
      <p>Here's what you can explore:</p>
      <ul>
        <li>Daily devotionals to nourish your soul</li>
        <li>Prayer points and guided prayers</li>
        <li>Inspiring music for worship and meditation</li>
        <li>Connect with Counsellors and fellow believers</li>
      </ul>
      <a href="{{siteUrl}}" class="button">Start Your Journey</a>
      <p>May God bless you abundantly!</p>
      <p>With love,<br>The ReKindle Team</p>
    </div>
    <div class="footer">
      <p>You received this email because you signed up at ReKindle</p>
    </div>
  </div>
</body>
</html>`,
    email_type: 'welcome'
  },
  devotional: {
    name: 'Daily Devotional',
    subject: 'Daily Devotional - {{date}}',
    html_content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Georgia, serif; line-height: 1.8; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%); color: white; padding: 40px 30px; text-align: center; }
    .content { padding: 40px 30px; }
    .verse { font-size: 18px; font-style: italic; color: #8b5cf6; margin: 30px 0; padding: 20px; background: #f8f5ff; border-left: 4px solid #8b5cf6; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f9f9f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Daily Devotional</h1>
      <p>{{date}}</p>
    </div>
    <div class="content">
      <h2>{{title}}</h2>
      <div class="verse">
        <p>"{{verseText}}"</p>
        <p style="text-align: right; margin-top: 10px;">— {{verseReference}}</p>
      </div>
      <p>{{reflection}}</p>
      <p><strong>Prayer:</strong> {{prayer}}</p>
      <p>May this word encourage you today!</p>
    </div>
    <div class="footer">
      <p>Daily devotionals from ReKindle</p>
    </div>
  </div>
</body>
</html>`,
    email_type: 'devotional'
  },
  booking: {
    name: 'Booking Confirmation',
    subject: 'Booking Confirmed - {{counsellorName}}',
    html_content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; }
    .content { padding: 40px 30px; }
    .booking-details { background: #f0fdf4; padding: 20px; border-radius: 10px; margin: 20px 0; }
    .detail-row { padding: 10px 0; border-bottom: 1px solid #d1fae5; }
    .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f9f9f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Confirmed!</h1>
    </div>
    <div class="content">
      <h2>Hi {{userName}},</h2>
      <p>Your Counselling session has been confirmed!</p>
      
      <div class="booking-details">
        <div class="detail-row"><strong>Counsellor:</strong> {{counsellorName}}</div>
        <div class="detail-row"><strong>Date:</strong> {{date}}</div>
        <div class="detail-row"><strong>Time:</strong> {{time}}</div>
        <div class="detail-row"><strong>Topic:</strong> {{topic}}</div>
      </div>
      
      <a href="{{meetingLink}}" class="button">Join Meeting</a>
      
      <p>We look forward to your session!</p>
    </div>
    <div class="footer">
      <p>Questions? Contact us at support@rekindle.app</p>
    </div>
  </div>
</body>
</html>`,
    email_type: 'booking'
  },
  new_convert: {
    name: 'New Convert Welcome',
    subject: 'Welcome to Your New Life in Christ!',
    html_content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Georgia, serif; line-height: 1.8; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 30px; text-align: center; }
    .content { padding: 40px 30px; }
    .verse { font-size: 18px; font-style: italic; color: #f59e0b; margin: 30px 0; padding: 20px; background: #fffbeb; border-left: 4px solid #f59e0b; }
    .button { display: inline-block; padding: 12px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f9f9f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Congratulations!</h1>
      <p>Welcome to Your New Life in Christ</p>
    </div>
    <div class="content">
      <h2>Dear {{userName}},</h2>
      <p>Heaven is rejoicing! You have made the most important decision of your life by accepting Jesus Christ as your Lord and Savior.</p>
      
      <div class="verse">
        <p>"Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!"</p>
        <p style="text-align: right; margin-top: 10px;">— 2 Corinthians 5:17</p>
      </div>
      
      <p>Here are some next steps for your spiritual journey:</p>
      <ul>
        <li>Read your Bible daily - start with the Gospel of John</li>
        <li>Pray regularly - talk to God like a friend</li>
        <li>Find a local church to fellowship with other believers</li>
        <li>Connect with a counsellor on ReKindle</li>
      </ul>
      
      <a href="{{siteUrl}}/new-believer" class="button">Start Your Journey</a>
      
      <p>We're here to support you every step of the way!</p>
      <p>With love and prayers,<br>The ReKindle Team</p>
    </div>
    <div class="footer">
      <p>You're part of God's family now!</p>
    </div>
  </div>
</body>
</html>`,
    email_type: 'new_convert'
  }
};

// Constants
const LOAD_TIMEOUT = 8000;

export const EmailNotificationManager: React.FC = () => {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    html_content: '',
    email_type: 'welcome'
  });

  // Refs to prevent duplicate operations
  const loadingRef = useRef(false);
  const isMounted = useRef(true);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadDone = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadTemplates();
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    // Prevent duplicate calls
    if (loadingRef.current) {
      console.log('[EmailNotificationManager] Already loading, skipping...');
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    // Set timeout
    loadTimeoutRef.current = setTimeout(() => {
      if (isMounted.current && loadingRef.current) {
        console.warn('[EmailNotificationManager] Loading timeout');
        setLoading(false);
        loadingRef.current = false;
      }
    }, LOAD_TIMEOUT);

    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      // Clear timeout
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }

      if (!isMounted.current) return;

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('[EmailNotificationManager] Error loading templates:', error);
    } finally {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      if (isMounted.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  }, []);

  const handleCreate = useCallback(() => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      subject: '',
      html_content: '',
      email_type: 'welcome'
    });
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      html_content: template.html_content,
      email_type: template.email_type
    });
    setShowModal(true);
  }, []);

  const handlePreview = useCallback((template: EmailTemplate) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name || !formData.subject || !formData.html_content) {
      toast({ title: t('emailNotificationManager', 'error', 'Error'), description: t('emailNotificationManager', 'fillRequiredFields', 'Please fill all required fields'), variant: 'destructive' });
      return;
    }

    try {
      if (editingTemplate) {
        await supabase
          .from('email_templates')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id);
        toast({ title: t('emailNotificationManager', 'success', 'Success'), description: t('emailNotificationManager', 'templateUpdated', 'Template updated successfully') });
      } else {
        await supabase
          .from('email_templates')
          .insert({
            ...formData,
            created_at: new Date().toISOString()
          });
        toast({ title: t('emailNotificationManager', 'success', 'Success'), description: t('emailNotificationManager', 'templateCreated', 'Template created successfully') });
      }
      setShowModal(false);
      
      // Delay reload to prevent rapid re-renders
      setTimeout(() => {
        if (isMounted.current) {
          loadTemplates();
        }
      }, 300);
    } catch (error: any) {
      toast({ title: t('emailNotificationManager', 'error', 'Error'), description: error.message, variant: 'destructive' });
    }
  }, [formData, editingTemplate, loadTemplates]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t('emailNotificationManager', 'confirmDelete', 'Delete this template?'))) return;

    try {
      await supabase.from('email_templates').delete().eq('id', id);
      toast({ title: t('emailNotificationManager', 'success', 'Success'), description: t('emailNotificationManager', 'templateDeleted', 'Template deleted') });
      
      // Delay reload
      setTimeout(() => {
        if (isMounted.current) {
          loadTemplates();
        }
      }, 300);
    } catch (error: any) {
      toast({ title: t('emailNotificationManager', 'error', 'Error'), description: error.message, variant: 'destructive' });
    }
  }, [loadTemplates]);

  const loadDefaultTemplate = useCallback((type: keyof typeof defaultTemplates) => {
    const template = defaultTemplates[type];
    setFormData(template);
  }, []);

  const sendTestEmail = useCallback(async () => {
    if (!testEmail || !previewTemplate) {
      toast({ title: t('emailNotificationManager', 'error', 'Error'), description: t('emailNotificationManager', 'enterEmailAddress', 'Please enter an email address'), variant: 'destructive' });
      return;
    }

    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          templateId: previewTemplate.id,
          recipientEmail: testEmail,
          variables: {
            userName: 'Test User',
            date: new Date().toLocaleDateString(),
            siteUrl: window.location.origin
          }
        }
      });

      if (error) throw error;
      toast({ title: t('emailNotificationManager', 'success', 'Success'), description: t('emailNotificationManager', 'testEmailSent', 'Test email sent to {email}').replace('{email}', String(testEmail)) });
      setTestEmail('');
    } catch (error: any) {
      toast({ title: t('emailNotificationManager', 'error', 'Error'), description: error.message, variant: 'destructive' });
    } finally {
      if (isMounted.current) {
        setSendingTest(false);
      }
    }
  }, [testEmail, previewTemplate]);

  const getTypeColor = useCallback((type: string) => {
    const colors: Record<string, string> = {
      welcome: 'bg-purple-100 text-purple-800',
      devotional: 'bg-blue-100 text-blue-800',
      booking: 'bg-green-100 text-green-800',
      new_convert: 'bg-amber-100 text-amber-800',
      general: 'bg-gray-100 text-gray-800'
    };
    return colors[type] || colors.general;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-8 w-8 text-purple-600" />
          <div>
            <h2 className="text-2xl font-bold">{t('emailNotificationManager', 'emailNotifications', 'Email Notifications')}</h2>
            <p className="text-sm text-gray-500">{t('emailNotificationManager', 'manageTemplatesDesc', 'Manage email templates and send notifications')}</p>
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('emailNotificationManager', 'newTemplate', 'New Template')}
        </Button>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg mb-4">{t('emailNotificationManager', 'noTemplatesYet', 'No email templates yet')}</p>
            <p className="text-gray-400 text-sm mb-6">{t('emailNotificationManager', 'createFirstTemplate', 'Create your first template or use a default one')}</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={() => { loadDefaultTemplate('welcome'); setShowModal(true); }}>
                {t('emailNotificationManager', 'addWelcomeTemplate', 'Add Welcome Template')}
              </Button>
              <Button variant="outline" onClick={() => { loadDefaultTemplate('devotional'); setShowModal(true); }}>
                {t('emailNotificationManager', 'addDevotionalTemplate', 'Add Devotional Template')}
              </Button>
              <Button variant="outline" onClick={() => { loadDefaultTemplate('new_convert'); setShowModal(true); }}>
                {t('emailNotificationManager', 'addNewConvertTemplate', 'Add New Convert Template')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <Badge className={`mt-1 ${getTypeColor(template.email_type)}`}>
                      {template.email_type}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4 truncate">{t('emailNotificationManager', 'subjectLabel', 'Subject:')} {template.subject}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handlePreview(template)}>
                    <Eye className="h-4 w-4 mr-1" />
                    {t('emailNotificationManager', 'preview', 'Preview')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(template)}>
                    <Edit className="h-4 w-4 mr-1" />
                    {t('emailNotificationManager', 'edit', 'Edit')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(template.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? t('emailNotificationManager', 'editTemplate', 'Edit Template') : t('emailNotificationManager', 'createTemplate', 'Create Template')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('emailNotificationManager', 'templateNameLabel', 'Template Name *')}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('emailNotificationManager', 'templateNamePlaceholder', 'e.g., Welcome Email')}
                />
              </div>
              <div>
                <Label>{t('emailNotificationManager', 'emailTypeLabel', 'Email Type *')}</Label>
                <Select value={formData.email_type} onValueChange={(v) => setFormData({ ...formData, email_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="welcome">{t('emailNotificationManager', 'typeWelcome', 'Welcome')}</SelectItem>
                    <SelectItem value="devotional">{t('emailNotificationManager', 'typeDevotional', 'Devotional')}</SelectItem>
                    <SelectItem value="booking">{t('emailNotificationManager', 'typeBooking', 'Booking')}</SelectItem>
                    <SelectItem value="new_convert">{t('emailNotificationManager', 'typeNewConvert', 'New Convert')}</SelectItem>
                    <SelectItem value="general">{t('emailNotificationManager', 'typeGeneral', 'General')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{t('emailNotificationManager', 'subjectLineLabel', 'Subject Line *')}</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder={t('emailNotificationManager', 'subjectPlaceholder', 'e.g., Welcome to ReKindle, {{userName}}!')}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('emailNotificationManager', 'variablesLabel', 'Variables:')} {'{{userName}}'}, {'{{date}}'}, {'{{siteUrl}}'}, {'{{counsellorName}}'}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('emailNotificationManager', 'htmlContentLabel', 'HTML Content *')}</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => loadDefaultTemplate('welcome')}>
                    {t('emailNotificationManager', 'typeWelcome', 'Welcome')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => loadDefaultTemplate('devotional')}>
                    {t('emailNotificationManager', 'typeDevotional', 'Devotional')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => loadDefaultTemplate('new_convert')}>
                    {t('emailNotificationManager', 'typeNewConvert', 'New Convert')}
                  </Button>
                </div>
              </div>
              <Textarea
                value={formData.html_content}
                onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
                rows={12}
                className="font-mono text-sm"
                placeholder="<html><body>...</body></html>"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('emailNotificationManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              {t('emailNotificationManager', 'saveTemplate', 'Save Template')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('emailNotificationManager', 'previewPrefix', 'Preview:')} {previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          
          {previewTemplate && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm"><strong>{t('emailNotificationManager', 'subjectLabel', 'Subject:')}</strong> {previewTemplate.subject}</p>
              </div>

              <div className="border rounded-lg p-4 bg-white">
                <div dangerouslySetInnerHTML={{ __html: previewTemplate.html_content }} />
              </div>

              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    {t('emailNotificationManager', 'sendTestEmail', 'Send Test Email')}
                  </h4>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder={t('emailNotificationManager', 'testEmailPlaceholder', 'Enter test email address')}
                      className="flex-1"
                    />
                    <Button onClick={sendTestEmail} disabled={sendingTest}>
                      {sendingTest ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('emailNotificationManager', 'sending', 'Sending...')}
                        </>
                      ) : t('emailNotificationManager', 'sendTest', 'Send Test')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>{t('emailNotificationManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailNotificationManager;
