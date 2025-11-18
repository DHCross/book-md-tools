'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  FileText,
  Download,
  Copy,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  FileCheck,
  AlertCircle,
  TrendingUp,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { analyzeDocument, DocumentComplianceReport, generateDocumentReport } from '@/lib/document-analyzer';

const EXAMPLE_DOCUMENT = `# Chapter 3: The Royal Court

## The King's Inner Circle

**His Majesty King Aldric the Wise**
Disposition: law/good
Race & Class: human, 12th level paladin
Hit Points (HP): 78
Armor Class (AC): 20
Primary attributes: strength, wisdom, charisma
Equipment: crown of rulership, plate mail +2, holy avenger +3, ring of protection +2
Special Abilities: divine grace, lay on hands, turn undead
Mount: celestial warhorse

**Chancellor Morgaine of House Blackwood**
Disposition: law/neutral
Race & Class: human, 8th level wizard
Hit Points (HP): 34
Armor Class (AC): 12
Primary attributes: intelligence, wisdom
Equipment: robes of the archmagi, staff of power, ring of spell storing
Spells: 0-4, 1st-6, 2nd-5, 3rd-4, 4th-3, 5th-2

## The Royal Guard

**Captain Sir Gareth**
human, 9th level fighter
Disposition: lawful good
Hit Points (HP): 67
Armor Class (AC): 18
Primary attributes: str, con
Equipment: +1 longsword, plate mail, large steel shield
Background: Veteran of the Dragon Wars

**Sergeant Marcus** x4
Race & Class: human, 5th level fighter
Hit Points (HP): 35
Armor Class (AC): 16
Primary attributes: strength, constitution
Equipment: longsword, chain mail, shield

## Court Wizards

**Archmagus Eldara**
Alignment: Neutral Good
Race & Class: elf, 14th level magic-user
Hit Points (HP): 42
Armor Class (AC): 11
Prime Attributes: INT, WIS
Equipment: Staff of the Magi, Robes of Protection +3, 2000gp worth of spell components
Spells: cantrips-6, 1st-8, 2nd-7, 3rd-6, 4th-5, 5th-4, 6th-3, 7th-2
Special Abilities: spell immunity (charm), enhanced familiar
Vision: Darkvision 60 feet

**Apprentice Lyra**
human, 3rd level wizard
HP: 12
AC: 10
Equipment: spell book, component pouch, 50 gp`;

export function DocumentAnalyzer() {
  const [documentText, setDocumentText] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [report, setReport] = useState<DocumentComplianceReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDocumentName(file.name);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let textContent = '';

      if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { default: mammoth } = await import('mammoth/mammoth.browser');
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.convertToMarkdown({ arrayBuffer });
        textContent = value;
      } else if (extension === 'pdf' || file.type === 'application/pdf') {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdfjs = pdfjsLib.default || pdfjsLib;
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs';
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdfDocument = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          const textContentData = await page.getTextContent();
          const pageText = textContentData.items
            .map((item) => (typeof item === 'object' && item && 'str' in item ? (item as { str: string }).str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          pages.push(pageText);
        }

        textContent = pages.join('\n\n');
      } else {
        textContent = await file.text();
      }

      if (!textContent.trim()) {
        toast.warning('No readable text found in the uploaded document');
      }

      setDocumentText(textContent);
    } catch (error) {
      console.error('Failed to read uploaded document', error);
      toast.error('Failed to read the uploaded document');
    } finally {
      event.target.value = '';
    }
  };

  const analyzeDocumentText = async () => {
    if (!documentText.trim()) {
      toast.error('Please provide document text to analyze');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Add a small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500));

      const analysisReport = analyzeDocument(documentText, documentName || 'Uploaded Document');
      setReport(analysisReport);
      toast.success(`Analyzed ${analysisReport.totalStatBlocks} stat blocks`);
    } catch (error) {
      toast.error('Error analyzing document');
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadExample = () => {
    setDocumentText(EXAMPLE_DOCUMENT);
    setDocumentName('Example: Royal Court Chapter');
  };

  const copyReport = async () => {
    if (!report) return;

    try {
      const reportText = generateDocumentReport(report);
      await navigator.clipboard.writeText(reportText);
      toast.success('Report copied to clipboard');
    } catch (error) {
      console.error('Failed to copy document analysis report to clipboard:', error);
      toast.error('Failed to copy report');
    }
  };

  const downloadReport = () => {
    if (!report) return;

    const reportText = generateDocumentReport(report);
    const blob = new Blob([reportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.documentName.replace(/[^a-z0-9]/gi, '_')}_compliance_report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const getComplianceColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400 border-emerald-400/40 bg-emerald-500/10';
    if (score >= 70) return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
    return 'text-red-400 border-red-400/40 bg-red-500/10';
  };

  const getComplianceIcon = (score: number) => {
    if (score >= 90) return <CheckCircle className="h-4 w-4 text-emerald-400" />;
    if (score >= 70) return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    return <AlertCircle className="h-4 w-4 text-red-400" />;
  };

  return (
    <div className="space-y-6">
      <Card className="border-white/15 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <FileCheck className="h-5 w-5 text-primary" />
            Document Compliance Analyzer
          </CardTitle>
          <CardDescription className="text-card-foreground/70">
            Upload or paste an entire document to analyze all stat blocks for C&C compliance.
            Perfect for reviewing adventure modules, sourcebooks, or campaign notes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="file-upload" className="block text-sm font-medium text-card-foreground mb-2">
                Upload Document
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".txt,.md,.rtf,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileUpload}
                className="block w-full text-sm text-card-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={loadExample} className="w-full">
                Load Example Document
              </Button>
            </div>
          </div>

          {documentName && (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm text-card-foreground">{documentName}</span>
            </div>
          )}

          <div>
            <label htmlFor="document-text" className="block text-sm font-medium text-card-foreground mb-2">
              Document Text
            </label>
            <Textarea
              id="document-text"
              placeholder="Paste your document content here..."
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              className="font-mono text-sm min-h-[200px]"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={analyzeDocumentText}
              disabled={isAnalyzing || !documentText.trim()}
              className="flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4" />
                  Analyze Document
                </>
              )}
            </Button>
            {report && (
              <>
                <Button variant="outline" onClick={copyReport} className="flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  Copy Report
                </Button>
                <Button variant="outline" onClick={downloadReport} className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card className="border-white/15 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <TrendingUp className="h-5 w-5 text-accent" />
              Compliance Report: {report.documentName}
            </CardTitle>
            <CardDescription className="text-card-foreground/70">
              Complete analysis of all {report.totalStatBlocks} stat blocks found in the document
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Section */}
            <Collapsible
              open={expandedSections.has('summary')}
              onOpenChange={() => toggleSection('summary')}
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                  <div className="flex items-center gap-2">
                    {expandedSections.has('summary') ?
                      <ChevronDown className="h-4 w-4" /> :
                      <ChevronRight className="h-4 w-4" />
                    }
                    <span className="text-lg font-semibold">Summary</span>
                  </div>
                  <Badge className={`${getComplianceColor(report.averageCompliance)}`}>
                    {report.averageCompliance}% avg
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-card-foreground/70">Total NPCs</span>
                    </div>
                    <div className="text-2xl font-bold text-card-foreground">{report.totalStatBlocks}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      {getComplianceIcon(report.averageCompliance)}
                      <span className="text-sm font-medium text-card-foreground/70">Avg Compliance</span>
                    </div>
                    <div className="text-2xl font-bold text-card-foreground">{report.averageCompliance}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-medium text-card-foreground/70">Total Issues</span>
                    </div>
                    <div className="text-2xl font-bold text-card-foreground">
                      {report.overallIssues.errors + report.overallIssues.warnings + report.overallIssues.infos}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-medium text-card-foreground/70">Excellent</span>
                    </div>
                    <div className="text-2xl font-bold text-card-foreground">{report.complianceDistribution.excellent}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-card-foreground/70">Compliance Distribution</span>
                    <span className="text-card-foreground/70">
                      {report.complianceDistribution.excellent} excellent, {report.complianceDistribution.good} good, {report.complianceDistribution.poor} needs work
                    </span>
                  </div>
                  <div className="flex rounded-lg overflow-hidden h-3">
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${(report.complianceDistribution.excellent / report.totalStatBlocks) * 100}%` }}
                    />
                    <div
                      className="bg-amber-400"
                      style={{ width: `${(report.complianceDistribution.good / report.totalStatBlocks) * 100}%` }}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: `${(report.complianceDistribution.poor / report.totalStatBlocks) * 100}%` }}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator className="border-white/10" />

            {/* Common Issues Section */}
            {report.commonIssues.length > 0 && (
              <Collapsible
                open={expandedSections.has('issues')}
                onOpenChange={() => toggleSection('issues')}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                    <div className="flex items-center gap-2">
                      {expandedSections.has('issues') ?
                        <ChevronDown className="h-4 w-4" /> :
                        <ChevronRight className="h-4 w-4" />
                      }
                      <span className="text-lg font-semibold">Common Issues</span>
                    </div>
                    <Badge variant="outline" className="border-amber-400/50 bg-amber-400/20 text-amber-100">
                      {report.commonIssues.length} categories
                    </Badge>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-2">
                  {report.commonIssues.map((issue, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs w-8 justify-center">
                          {index + 1}
                        </Badge>
                        <span className="font-medium text-card-foreground">{issue.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-card-foreground/70">{issue.count} occurrences</span>
                        <Badge variant="outline" className="text-xs">
                          {issue.percentage}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            <Separator className="border-white/10" />

            {/* Recommendations Section */}
            <Collapsible
              open={expandedSections.has('recommendations')}
              onOpenChange={() => toggleSection('recommendations')}
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                  <div className="flex items-center gap-2">
                    {expandedSections.has('recommendations') ?
                      <ChevronDown className="h-4 w-4" /> :
                      <ChevronRight className="h-4 w-4" />
                    }
                    <span className="text-lg font-semibold">Recommendations</span>
                  </div>
                  <Badge variant="outline" className="border-blue-400/50 bg-blue-400/20 text-blue-100">
                    {report.recommendations.length} tips
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-2">
                {report.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                    <Badge variant="outline" className="text-xs w-8 justify-center mt-0.5">
                      {index + 1}
                    </Badge>
                    <span className="text-sm text-card-foreground">{recommendation}</span>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Separator className="border-white/10" />

            {/* Detailed Results Section */}
            <Collapsible
              open={expandedSections.has('details')}
              onOpenChange={() => toggleSection('details')}
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                  <div className="flex items-center gap-2">
                    {expandedSections.has('details') ?
                      <ChevronDown className="h-4 w-4" /> :
                      <ChevronRight className="h-4 w-4" />
                    }
                    <span className="text-lg font-semibold">Detailed Results</span>
                  </div>
                  <Badge variant="outline">
                    {report.statBlocks.length} stat blocks
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                {report.statBlocks.map((statBlock, index) => {
                  const npcName = statBlock.npc.converted.split('(')[0].trim().replace(/^\*\*|\*\*$/g, '');
                  const compliance = statBlock.npc.validation.complianceScore;
                  const hasIssues = statBlock.npc.validation.warnings.length > 0;

                  return (
                    <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs w-8 justify-center">
                            {index + 1}
                          </Badge>
                          <span className="font-medium text-card-foreground">{npcName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getComplianceIcon(compliance)}
                          <Badge className={`text-xs ${getComplianceColor(compliance)}`}>
                            {compliance}%
                          </Badge>
                        </div>
                      </div>

                      <div className="text-xs text-card-foreground/70 mb-2">
                        Lines {statBlock.lineStart}-{statBlock.lineEnd}
                      </div>

                      {hasIssues && (
                        <div className="flex flex-wrap gap-1">
                          {statBlock.npc.validation.warnings.slice(0, 3).map((warning, wIndex) => (
                            <Badge
                              key={wIndex}
                              variant="outline"
                              className={`text-xs ${
                                warning.type === 'error' ? 'border-red-400/50 bg-red-500/20 text-red-100' :
                                warning.type === 'warning' ? 'border-amber-400/50 bg-amber-400/20 text-amber-100' :
                                'border-blue-400/50 bg-blue-400/20 text-blue-100'
                              }`}
                            >
                              {warning.category}
                            </Badge>
                          ))}
                          {statBlock.npc.validation.warnings.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{statBlock.npc.validation.warnings.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}