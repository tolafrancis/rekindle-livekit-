import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  User, FileText, Briefcase, Upload, ChevronRight, ChevronLeft,
  CheckCircle, Loader2, Heart, BookOpen, Users, X, AlertCircle
} from 'lucide-react';

const SPECIALIZATIONS = [
  { id: 'discipleship', label: 'Discipleship', icon: BookOpen },
  { id: 'marriage', label: 'Marriage', icon: Heart },
  { id: 'family', label: 'Family', icon: Users },
  { id: 'career', label: 'Career Guidance', icon: Briefcase },
  { id: 'youth', label: 'Youth Ministry', icon: Users },
  { id: 'grief', label: 'Grief & Loss', icon: Heart },
  { id: 'addiction', label: 'Addiction Recovery', icon: Heart },
  { id: 'depression', label: 'Depression & Anxiety', icon: Heart },
  { id: 'spiritual_growth', label: 'Spiritual Growth', icon: BookOpen },
  { id: 'prayer', label: 'Prayer & Intercession', icon: BookOpen },
  { id: 'leadership', label: 'Leadership Development', icon: Briefcase },
  { id: 'women', label: "Women's Ministry", icon: Users },
  { id: 'men', label: "Men's Ministry", icon: Users },
  { id: 'singles', label: 'Singles Ministry', icon: Users },
  { id: 'trauma', label: 'Trauma Healing', icon: Heart },
];

const LANGUAGES = [
  'English', 'Spanish', 'French', 'Portuguese', 'Mandarin', 
  'Korean', 'Swahili', 'Yoruba', 'Arabic', 'Hindi', 'German'
];

interface FormData {
  full_name: string;
  email: string;
  phone: string;
  bio: string;
  testimony: string;
  specializations: string[];
  ministry_affiliation: string;
  church_name: string;
  years_of_experience: number;
  languages: string[];
  certification_files: File[];
}

interface CounsellorApplicationFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CounsellorApplicationForm: React.FC<CounsellorApplicationFormProps> = ({
  onSuccess,
  onCancel
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<FormData>({
    full_name: user?.user_metadata?.full_name || '',
    email: user?.email || '',
    phone: '',
    bio: '',
    testimony: '',
    specializations: [],
    ministry_affiliation: '',
    church_name: '',
    years_of_experience: 0,
    languages: ['English'],
    certification_files: []
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const totalSteps = 4;
  const progress = (currentStep / totalSteps) * 100;

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    switch (step) {
      case 1:
        if (!formData.full_name.trim()) newErrors.full_name = t('counsellorApplicationForm', 'errFullNameRequired', 'Full name is required');
        if (!formData.email.trim()) newErrors.email = t('counsellorApplicationForm', 'errEmailRequired', 'Email is required');
        if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          newErrors.email = t('counsellorApplicationForm', 'errEmailInvalid', 'Please enter a valid email');
        }
        break;
      case 2:
        if (!formData.bio.trim()) newErrors.bio = t('counsellorApplicationForm', 'errBioRequired', 'Bio is required (minimum 100 characters)');
        if (formData.bio.length < 100) newErrors.bio = t('counsellorApplicationForm', 'errBioMinLength', 'Bio must be at least 100 characters');
        break;
      case 3:
        if (formData.specializations.length === 0) {
          newErrors.specializations = t('counsellorApplicationForm', 'errSpecializationRequired', 'Please select at least one area of specialization');
        }
        if (formData.years_of_experience < 0) {
          newErrors.years_of_experience = t('counsellorApplicationForm', 'errYearsNegative', 'Years of experience cannot be negative');
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const toggleSpecialization = (specId: string) => {
    setFormData(prev => ({
      ...prev,
      specializations: prev.specializations.includes(specId)
        ? prev.specializations.filter(s => s !== specId)
        : [...prev.specializations, specId]
    }));
  };

  const toggleLanguage = (lang: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang]
    }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      const maxSize = 5 * 1024 * 1024; // 5MB
      return validTypes.includes(file.type) && file.size <= maxSize;
    });

    if (validFiles.length !== files.length) {
      toast({
        title: t('counsellorApplicationForm', 'invalidFilesTitle', 'Invalid Files'),
        description: t('counsellorApplicationForm', 'invalidFilesDesc', 'Some files were rejected. Only PDF and images under 5MB are allowed.'),
        variant: 'destructive'
      });
    }

    setFormData(prev => ({
      ...prev,
      certification_files: [...prev.certification_files, ...validFiles]
    }));
  };

  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      certification_files: prev.certification_files.filter((_, i) => i !== index)
    }));
  };

  const uploadCertifications = async (): Promise<string[]> => {
    const urls: string[] = [];
    const totalFiles = formData.certification_files.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = formData.certification_files[i];
      const fileName = `${user?.id}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      
      const { data, error } = await supabase.storage
        .from('counsellor-certifications')
        .upload(fileName, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('counsellor-certifications')
        .getPublicUrl(fileName);

      urls.push(urlData.publicUrl);
      setUploadProgress(((i + 1) / totalFiles) * 100);
    }

    return urls;
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    if (!user) {
      toast({ title: t('counsellorApplicationForm', 'errorTitle', 'Error'), description: t('counsellorApplicationForm', 'mustBeLoggedIn', 'You must be logged in to apply'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);

    try {
      // Check for existing pending application
      const { data: existingApp } = await supabase
        .from('counsellor_applications')
        .select('id, status')
        .eq('user_id', user.id)
        .in('status', ['pending', 'under_review'])
        .single();

      if (existingApp) {
        toast({
          title: t('counsellorApplicationForm', 'applicationExistsTitle', 'Application Exists'),
          description: t('counsellorApplicationForm', 'applicationExistsDesc', 'You already have a pending application. Please wait for review.'),
          variant: 'destructive'
        });
        setSubmitting(false);
        return;
      }

      // Upload certifications
      let certificationUrls: string[] = [];
      if (formData.certification_files.length > 0) {
        certificationUrls = await uploadCertifications();
      }

      // Get specialization labels
      const selectedSpecLabels = formData.specializations.map(
        id => SPECIALIZATIONS.find(s => s.id === id)?.label || id
      );

      // Submit application
      const { error } = await supabase.from('counsellor_applications').insert({
        user_id: user.id,
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone || null,
        bio: formData.bio,
        testimony: formData.testimony || null,
        specializations: selectedSpecLabels,
        ministry_affiliation: formData.ministry_affiliation || null,
        church_name: formData.church_name || null,
        years_of_experience: formData.years_of_experience,
        languages: formData.languages,
        certification_urls: certificationUrls,
        status: 'pending'
      });

      if (error) throw error;

      toast({
        title: t('counsellorApplicationForm', 'applicationSubmittedTitle', 'Application Submitted!'),
        description: t('counsellorApplicationForm', 'applicationSubmittedDesc', 'Your counsellor application has been submitted for review. We will notify you once it has been processed.')
      });

      onSuccess?.();
    } catch (err: any) {
      console.error('Application error:', err);
      toast({
        title: t('counsellorApplicationForm', 'submissionFailedTitle', 'Submission Failed'),
        description: err.message || t('counsellorApplicationForm', 'submissionFailedDesc', 'Failed to submit application. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        {[1, 2, 3, 4].map(step => (
          <div
            key={step}
            className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
              step < currentStep
                ? 'bg-green-500 border-green-500 text-white'
                : step === currentStep
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white border-gray-300 text-gray-400'
            }`}
          >
            {step < currentStep ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              step
            )}
          </div>
        ))}
      </div>
      <Progress value={progress} className="h-2" />
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{t('counsellorApplicationForm', 'stepPersonalInfo', 'Personal Info')}</span>
        <span>{t('counsellorApplicationForm', 'stepBioTestimony', 'Bio & Testimony')}</span>
        <span>{t('counsellorApplicationForm', 'qualificationsCardTitle', 'Qualifications')}</span>
        <span>{t('counsellorApplicationForm', 'stepReview', 'Review')}</span>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <User className="h-12 w-12 mx-auto text-purple-600 mb-2" />
        <h3 className="text-xl font-semibold">{t('counsellorApplicationForm', 'personalInformation', 'Personal Information')}</h3>
        <p className="text-gray-500">{t('counsellorApplicationForm', 'tellUsAboutYourself', 'Tell us about yourself')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="full_name">{t('counsellorApplicationForm', 'fullNameLabel', 'Full Name *')}</Label>
          <Input
            id="full_name"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            placeholder={t('counsellorApplicationForm', 'fullNamePlaceholder', 'Enter your full name')}
            className={errors.full_name ? 'border-red-500' : ''}
          />
          {errors.full_name && (
            <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.full_name}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="email">{t('counsellorApplicationForm', 'emailAddressLabel', 'Email Address *')}</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="your.email@example.com"
            className={errors.email ? 'border-red-500' : ''}
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.email}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="phone">{t('counsellorApplicationForm', 'phoneNumberLabel', 'Phone Number (Optional)')}</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder={t('counsellorApplicationForm', 'phonePlaceholder', '+1 234 567 8900')}
          />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <FileText className="h-12 w-12 mx-auto text-purple-600 mb-2" />
        <h3 className="text-xl font-semibold">{t('counsellorApplicationForm', 'bioTestimonyHeading', 'Bio & Testimony')}</h3>
        <p className="text-gray-500">{t('counsellorApplicationForm', 'shareStoryExperience', 'Share your story and experience')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="bio">{t('counsellorApplicationForm', 'professionalBioLabel', 'Professional Bio *')}</Label>
          <Textarea
            id="bio"
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder={t('counsellorApplicationForm', 'bioPlaceholder', 'Share your background, experience, and approach to counselling. What makes you passionate about helping others? (Minimum 100 characters)')}
            rows={5}
            className={errors.bio ? 'border-red-500' : ''}
          />
          <div className="flex justify-between mt-1">
            {errors.bio && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {errors.bio}
              </p>
            )}
            <p className={`text-sm ml-auto ${formData.bio.length < 100 ? 'text-amber-500' : 'text-green-500'}`}>
              {t('counsellorApplicationForm', 'charactersCount', '{count}/100 characters').replace('{count}', String(formData.bio.length))}
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="testimony">{t('counsellorApplicationForm', 'personalTestimonyLabel', 'Personal Testimony (Optional)')}</Label>
          <Textarea
            id="testimony"
            value={formData.testimony}
            onChange={(e) => setFormData({ ...formData, testimony: e.target.value })}
            placeholder={t('counsellorApplicationForm', 'testimonyPlaceholder', 'Share your faith journey and how God has worked in your life...')}
            rows={4}
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <Briefcase className="h-12 w-12 mx-auto text-purple-600 mb-2" />
        <h3 className="text-xl font-semibold">{t('counsellorApplicationForm', 'qualificationsExperienceHeading', 'Qualifications & Experience')}</h3>
        <p className="text-gray-500">{t('counsellorApplicationForm', 'expertiseCredentials', 'Your expertise and credentials')}</p>
      </div>

      <div className="space-y-6">
        <div>
          <Label>{t('counsellorApplicationForm', 'areasOfSpecializationLabel', 'Areas of Specialization *')}</Label>
          <p className="text-sm text-gray-500 mb-3">{t('counsellorApplicationForm', 'selectAllAreas', 'Select all areas you are qualified to counsel in')}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {SPECIALIZATIONS.map(spec => (
              <div
                key={spec.id}
                onClick={() => toggleSpecialization(spec.id)}
                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                  formData.specializations.includes(spec.id)
                    ? 'bg-purple-50 border-purple-500 text-purple-700'
                    : 'bg-white border-gray-200 hover:border-purple-300'
                }`}
              >
                <Checkbox
                  checked={formData.specializations.includes(spec.id)}
                  className="pointer-events-none"
                />
                <span className="text-sm">{spec.label}</span>
              </div>
            ))}
          </div>
          {errors.specializations && (
            <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.specializations}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ministry_affiliation">{t('counsellorApplicationForm', 'ministryAffiliationLabel', 'Ministry/Organization Affiliation')}</Label>
            <Input
              id="ministry_affiliation"
              value={formData.ministry_affiliation}
              onChange={(e) => setFormData({ ...formData, ministry_affiliation: e.target.value })}
              placeholder={t('counsellorApplicationForm', 'ministryAffiliationPlaceholder', 'e.g., RCCG, Hillsong, etc.')}
            />
          </div>
          <div>
            <Label htmlFor="church_name">{t('counsellorApplicationForm', 'churchNameLabel', 'Church Name')}</Label>
            <Input
              id="church_name"
              value={formData.church_name}
              onChange={(e) => setFormData({ ...formData, church_name: e.target.value })}
              placeholder={t('counsellorApplicationForm', 'churchNamePlaceholder', 'Your local church')}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="years_of_experience">{t('counsellorApplicationForm', 'yearsOfExperienceLabel', 'Years of Counselling Experience')}</Label>
          <Input
            id="years_of_experience"
            type="number"
            min="0"
            value={formData.years_of_experience}
            onChange={(e) => setFormData({ ...formData, years_of_experience: parseInt(e.target.value) || 0 })}
            className="w-32"
          />
        </div>

        <div>
          <Label>{t('counsellorApplicationForm', 'languagesSpokenLabel', 'Languages Spoken')}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {LANGUAGES.map(lang => (
              <Badge
                key={lang}
                variant={formData.languages.includes(lang) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleLanguage(lang)}
              >
                {lang}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <Label>{t('counsellorApplicationForm', 'certificationsLabel', 'Certifications & Credentials (Optional)')}</Label>
          <p className="text-sm text-gray-500 mb-2">{t('counsellorApplicationForm', 'certificationsHelp', 'Upload any relevant certifications, degrees, or credentials (PDF or images, max 5MB each)')}</p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-dashed"
          >
            <Upload className="h-4 w-4 mr-2" />
            {t('counsellorApplicationForm', 'uploadFiles', 'Upload Files')}
          </Button>

          {formData.certification_files.length > 0 && (
            <div className="mt-3 space-y-2">
              {formData.certification_files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
        <h3 className="text-xl font-semibold">{t('counsellorApplicationForm', 'reviewYourApplication', 'Review Your Application')}</h3>
        <p className="text-gray-500">{t('counsellorApplicationForm', 'pleaseReviewInfo', 'Please review your information before submitting')}</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">{t('counsellorApplicationForm', 'personalInformation', 'Personal Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><strong>{t('counsellorApplicationForm', 'nameLabel', 'Name:')}</strong> {formData.full_name}</p>
            <p><strong>{t('counsellorApplicationForm', 'emailLabel', 'Email:')}</strong> {formData.email}</p>
            {formData.phone && <p><strong>{t('counsellorApplicationForm', 'phoneLabel', 'Phone:')}</strong> {formData.phone}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">{t('counsellorApplicationForm', 'bioCardTitle', 'Bio')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{formData.bio}</p>
          </CardContent>
        </Card>

        {formData.testimony && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">{t('counsellorApplicationForm', 'testimonyCardTitle', 'Testimony')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{formData.testimony}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">{t('counsellorApplicationForm', 'qualificationsCardTitle', 'Qualifications')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">{t('counsellorApplicationForm', 'specializationsLabel', 'Specializations:')}</p>
              <div className="flex flex-wrap gap-1">
                {formData.specializations.map(id => {
                  const spec = SPECIALIZATIONS.find(s => s.id === id);
                  return (
                    <Badge key={id} variant="secondary">
                      {spec?.label || id}
                    </Badge>
                  );
                })}
              </div>
            </div>
            {formData.ministry_affiliation && (
              <p><strong>{t('counsellorApplicationForm', 'ministryLabel', 'Ministry:')}</strong> {formData.ministry_affiliation}</p>
            )}
            {formData.church_name && (
              <p><strong>{t('counsellorApplicationForm', 'churchLabel', 'Church:')}</strong> {formData.church_name}</p>
            )}
            <p><strong>{t('counsellorApplicationForm', 'experienceLabel', 'Experience:')}</strong> {t('counsellorApplicationForm', 'yearsSuffix', '{years} years').replace('{years}', String(formData.years_of_experience))}</p>
            <div>
              <p className="text-sm font-medium mb-1">{t('counsellorApplicationForm', 'languagesLabel', 'Languages:')}</p>
              <div className="flex flex-wrap gap-1">
                {formData.languages.map(lang => (
                  <Badge key={lang} variant="outline">{lang}</Badge>
                ))}
              </div>
            </div>
            {formData.certification_files.length > 0 && (
              <p><strong>{t('counsellorApplicationForm', 'certificationsReviewLabel', 'Certifications:')}</strong> {t('counsellorApplicationForm', 'filesAttached', '{count} file(s) attached').replace('{count}', String(formData.certification_files.length))}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {submitting && uploadProgress > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{t('counsellorApplicationForm', 'uploadingCertifications', 'Uploading certifications...')}</p>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}
    </div>
  );

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl text-center">{t('counsellorApplicationForm', 'becomeACounsellor', 'Become a Counsellor')}</CardTitle>
        <CardDescription className="text-center">
          {t('counsellorApplicationForm', 'headerDescription', 'Join our team of dedicated counsellors and help others on their spiritual journey')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {renderStepIndicator()}

        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}

        <div className="flex justify-between mt-8">
          <div>
            {onCancel && currentStep === 1 && (
              <Button variant="ghost" onClick={onCancel}>
                {t('counsellorApplicationForm', 'cancel', 'Cancel')}
              </Button>
            )}
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={submitting}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('counsellorApplicationForm', 'back', 'Back')}
              </Button>
            )}
          </div>
          
          {currentStep < totalSteps ? (
            <Button onClick={handleNext}>
              {t('counsellorApplicationForm', 'next', 'Next')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="bg-green-600 hover:bg-green-700">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('counsellorApplicationForm', 'submitting', 'Submitting...')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('counsellorApplicationForm', 'submitApplication', 'Submit Application')}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CounsellorApplicationForm;
