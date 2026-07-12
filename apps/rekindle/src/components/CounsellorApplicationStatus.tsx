import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Clock, CheckCircle, XCircle, AlertCircle, FileText, 
  Calendar, Loader2, Eye, UserCheck, RefreshCw
} from 'lucide-react';
import CounsellorApplicationForm from './CounsellorApplicationForm';

interface Application {
  id: string;
  full_name: string;
  email: string;
  bio: string;
  specializations: string[];
  ministry_affiliation: string | null;
  church_name: string | null;
  years_of_experience: number;
  languages: string[];
  certification_urls: string[];
  status: 'pending' | 'approved' | 'rejected' | 'under_review';
  admin_notes: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export const CounsellorApplicationStatus: React.FC = () => {
  const { user } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (user) {
      loadApplication();
    }
  }, [user]);

  const loadApplication = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('counsellor_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading application:', error);
      }
      
      setApplication(data);
    } catch (err) {
      console.error('Failed to load application:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'text-amber-500',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          badgeVariant: 'outline' as const,
          title: 'Application Pending',
          description: 'Your application is in the queue and will be reviewed soon.'
        };
      case 'under_review':
        return {
          icon: Eye,
          color: 'text-blue-500',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          badgeVariant: 'secondary' as const,
          title: 'Under Review',
          description: 'An administrator is currently reviewing your application.'
        };
      case 'approved':
        return {
          icon: CheckCircle,
          color: 'text-green-500',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          badgeVariant: 'default' as const,
          title: 'Application Approved!',
          description: 'Congratulations! You are now a verified counsellor.'
        };
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-red-500',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          badgeVariant: 'destructive' as const,
          title: 'Application Not Approved',
          description: 'Unfortunately, your application was not approved at this time.'
        };
      default:
        return {
          icon: AlertCircle,
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          badgeVariant: 'outline' as const,
          title: 'Unknown Status',
          description: 'Please contact support for more information.'
        };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!application) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="py-8">
            <div className="text-center">
              <UserCheck className="h-12 w-12 mx-auto text-purple-300 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Become a Counsellor</h3>
              <p className="text-gray-500 mb-4">
                Share your gifts and help others on their spiritual journey by becoming a certified counsellor.
              </p>
              <Button onClick={() => setShowApplicationForm(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Apply Now
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showApplicationForm} onOpenChange={setShowApplicationForm}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <CounsellorApplicationForm
              onSuccess={() => {
                setShowApplicationForm(false);
                loadApplication();
              }}
              onCancel={() => setShowApplicationForm(false)}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const statusConfig = getStatusConfig(application.status);
  const StatusIcon = statusConfig.icon;

  return (
    <>
      <Card className={`${statusConfig.borderColor} border-2`}>
        <CardHeader className={statusConfig.bgColor}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-8 w-8 ${statusConfig.color}`} />
              <div>
                <CardTitle className="text-lg">{statusConfig.title}</CardTitle>
                <CardDescription>{statusConfig.description}</CardDescription>
              </div>
            </div>
            <Badge variant={statusConfig.badgeVariant} className="capitalize">
              {application.status.replace('_', ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
              <span>Applied on {new Date(application.created_at).toLocaleDateString()}</span>
            </div>

            {application.reviewed_at && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <CheckCircle className="h-4 w-4" />
                <span>Reviewed on {new Date(application.reviewed_at).toLocaleDateString()}</span>
              </div>
            )}

            {application.status === 'rejected' && application.rejection_reason && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-medium text-red-700 mb-1">Reason for Rejection:</p>
                <p className="text-sm text-red-600">{application.rejection_reason}</p>
              </div>
            )}

            {application.status === 'approved' && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-700">
                  You can now access the counsellor dashboard and start accepting session requests from users.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDetails(true)}>
                <Eye className="h-4 w-4 mr-1" />
                View Application
              </Button>
              <Button variant="ghost" size="sm" onClick={loadApplication}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh Status
              </Button>
            </div>

            {application.status === 'rejected' && (
              <Button 
                className="w-full mt-2" 
                onClick={() => setShowApplicationForm(true)}
              >
                Submit New Application
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Application Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your Counsellor Application</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Full Name</p>
                <p className="font-medium">{application.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{application.email}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1">Bio</p>
              <p className="text-sm bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{application.bio}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-2">Specializations</p>
              <div className="flex flex-wrap gap-2">
                {application.specializations.map(spec => (
                  <Badge key={spec} variant="secondary">{spec}</Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {application.ministry_affiliation && (
                <div>
                  <p className="text-sm text-gray-500">Ministry Affiliation</p>
                  <p className="font-medium">{application.ministry_affiliation}</p>
                </div>
              )}
              {application.church_name && (
                <div>
                  <p className="text-sm text-gray-500">Church</p>
                  <p className="font-medium">{application.church_name}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Years of Experience</p>
                <p className="font-medium">{application.years_of_experience} years</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Languages</p>
                <div className="flex flex-wrap gap-1">
                  {application.languages.map(lang => (
                    <Badge key={lang} variant="outline" className="text-xs">{lang}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {application.certification_urls.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-2">Uploaded Certifications</p>
                <div className="space-y-2">
                  {application.certification_urls.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-purple-600" />
                      <span className="text-sm text-purple-600 hover:underline">
                        Certificate {index + 1}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Application Form Modal */}
      <Dialog open={showApplicationForm} onOpenChange={setShowApplicationForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <CounsellorApplicationForm
            onSuccess={() => {
              setShowApplicationForm(false);
              loadApplication();
            }}
            onCancel={() => setShowApplicationForm(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CounsellorApplicationStatus;
