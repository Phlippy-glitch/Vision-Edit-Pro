# CLAUDE.md - AI Assistant Guide for Vision-Edit-Pro

> **Last Updated:** 2026-01-18
> **Repository:** Vision-Edit-Pro
> **Purpose:** Comprehensive guide for AI assistants working on this codebase

---

## Table of Contents

1. [Repository Overview](#repository-overview)
2. [Codebase Structure](#codebase-structure)
3. [Development Workflow](#development-workflow)
4. [Git Conventions](#git-conventions)
5. [Code Standards & Conventions](#code-standards--conventions)
6. [Testing Guidelines](#testing-guidelines)
7. [Documentation Practices](#documentation-practices)
8. [Common Tasks](#common-tasks)
9. [Architecture Patterns](#architecture-patterns)
10. [Security Considerations](#security-considerations)

---

## Repository Overview

### Project Purpose
Vision-Edit-Pro is a professional image/video editing application designed to provide advanced editing capabilities with a focus on user experience and performance.

### Tech Stack
*To be updated as technologies are added to the project*

**Frontend:**
- Framework: TBD (React, Vue, Svelte, etc.)
- UI Library: TBD
- State Management: TBD
- Build Tool: TBD (Vite, Webpack, etc.)

**Backend:**
- Runtime: TBD (Node.js, Python, etc.)
- Framework: TBD
- Database: TBD

**Media Processing:**
- Image Processing: TBD (Sharp, ImageMagick, Canvas API, etc.)
- Video Processing: TBD (FFmpeg, WebCodecs API, etc.)

### Key Features
*To be documented as features are implemented*

---

## Codebase Structure

### Recommended Directory Structure

```
Vision-Edit-Pro/
├── src/                      # Source code
│   ├── components/           # Reusable UI components
│   ├── features/             # Feature-specific modules
│   ├── services/             # Business logic and API services
│   ├── utils/                # Utility functions
│   ├── hooks/                # Custom hooks (if applicable)
│   ├── types/                # TypeScript type definitions
│   ├── assets/               # Static assets (images, fonts, etc.)
│   └── styles/               # Global styles and themes
├── tests/                    # Test files
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── docs/                     # Documentation
├── scripts/                  # Build and utility scripts
├── public/                   # Public assets
└── config/                   # Configuration files
```

### File Naming Conventions

- **Components:** PascalCase (e.g., `ImageEditor.tsx`, `ToolbarButton.tsx`)
- **Utilities:** camelCase (e.g., `imageProcessing.ts`, `formatUtils.ts`)
- **Tests:** Match source files with `.test.ts` or `.spec.ts` suffix
- **Types:** PascalCase with `.types.ts` suffix (e.g., `Editor.types.ts`)
- **Constants:** UPPER_SNAKE_CASE in `constants.ts` files

---

## Development Workflow

### Branch Strategy

1. **Main Branch:** Production-ready code
2. **Development Branch:** Integration branch for features
3. **Feature Branches:** `claude/feature-description-xxxxx` format
4. **Hotfix Branches:** `hotfix/description` for urgent fixes

### Before Starting Work

1. **Understand the Task:** Read the issue/requirement carefully
2. **Check Existing Code:** Search for similar implementations
3. **Plan the Approach:** Break down complex tasks into steps
4. **Ask Questions:** Clarify ambiguities before implementation

### During Development

1. **Read Before Modifying:** Always read files before editing them
2. **Minimal Changes:** Only modify what's necessary for the task
3. **Maintain Consistency:** Follow existing patterns and conventions
4. **Test Changes:** Verify functionality after modifications
5. **Update Documentation:** Keep docs in sync with code changes

### After Implementation

1. **Self-Review:** Check your changes for quality and completeness
2. **Run Tests:** Ensure all tests pass
3. **Update CLAUDE.md:** Document new patterns or conventions
4. **Commit & Push:** Use clear commit messages

---

## Git Conventions

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring without behavior change
- `docs`: Documentation changes
- `style`: Formatting, missing semicolons, etc.
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

**Examples:**
```
feat(editor): add layer blending modes

Implement multiply, overlay, and screen blending modes for image layers.
Includes UI controls in the layers panel.

Closes #123

---

fix(toolbar): prevent toolbar overflow on small screens

Apply responsive flexbox layout to toolbar component to wrap tools
on screens smaller than 768px width.

---

docs(readme): update installation instructions

Add missing environment variable configuration steps.
```

### Commit Best Practices

- **Atomic Commits:** One logical change per commit
- **Clear Messages:** Describe the "why" not just the "what"
- **Present Tense:** Use "add" not "added", "fix" not "fixed"
- **Reference Issues:** Include issue numbers when applicable
- **No WIP Commits:** Squash work-in-progress commits before pushing

### Pull Request Guidelines

**PR Title Format:**
```
[Feature/Fix/Docs] Brief description
```

**PR Description Template:**
```markdown
## Summary
Brief overview of changes

## Changes Made
- Bullet point list of specific changes
- Include file paths when relevant

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] No regressions observed

## Screenshots (if UI changes)
[Add screenshots here]

## Related Issues
Closes #xxx
Related to #yyy
```

---

## Code Standards & Conventions

### General Principles

1. **KISS (Keep It Simple, Stupid):** Prefer simple solutions over complex ones
2. **DRY (Don't Repeat Yourself):** Extract repeated logic into reusable functions
3. **YAGNI (You Aren't Gonna Need It):** Don't add functionality speculatively
4. **Separation of Concerns:** Keep business logic separate from UI
5. **Single Responsibility:** Each function/class should have one clear purpose

### Code Style

**Formatting:**
- Use consistent indentation (2 or 4 spaces, as configured)
- Max line length: 80-120 characters
- Trailing commas in multi-line structures
- Semicolons as per project convention

**Naming:**
- **Variables/Functions:** camelCase, descriptive names
- **Classes/Components:** PascalCase
- **Constants:** UPPER_SNAKE_CASE
- **Private Members:** Prefix with underscore (e.g., `_privateMethod`)
- **Boolean Variables:** Use prefixes like `is`, `has`, `should` (e.g., `isVisible`, `hasPermission`)

**Functions:**
- Keep functions small and focused (under 50 lines ideally)
- Use descriptive names that explain what the function does
- Prefer pure functions when possible
- Document complex functions with JSDoc/TSDoc comments

### TypeScript Best Practices

```typescript
// ✅ Good: Explicit types for function parameters and returns
function processImage(
  image: ImageData,
  options: ProcessingOptions
): Promise<ProcessedImage> {
  // Implementation
}

// ❌ Bad: Implicit any types
function processImage(image, options) {
  // Implementation
}

// ✅ Good: Use interfaces for object shapes
interface EditorState {
  layers: Layer[];
  activeLayerId: string | null;
  zoomLevel: number;
}

// ✅ Good: Use enums for fixed sets of values
enum BlendMode {
  Normal = 'normal',
  Multiply = 'multiply',
  Overlay = 'overlay',
  Screen = 'screen'
}

// ✅ Good: Use union types for specific options
type ImageFormat = 'png' | 'jpg' | 'webp' | 'gif';
```

### Error Handling

```typescript
// ✅ Good: Specific error handling with user-friendly messages
try {
  const result = await processImage(imageData);
  return result;
} catch (error) {
  if (error instanceof ImageFormatError) {
    throw new Error('Unsupported image format. Please use PNG, JPG, or WEBP.');
  }
  if (error instanceof ImageSizeError) {
    throw new Error('Image size exceeds maximum allowed size of 50MB.');
  }
  // Log unexpected errors
  console.error('Image processing failed:', error);
  throw new Error('Failed to process image. Please try again.');
}

// ❌ Bad: Silent error swallowing
try {
  await processImage(imageData);
} catch (error) {
  // Do nothing
}

// ❌ Bad: Generic error messages
try {
  await processImage(imageData);
} catch (error) {
  throw new Error('An error occurred');
}
```

### Performance Considerations

1. **Lazy Loading:** Load heavy components/resources only when needed
2. **Memoization:** Cache expensive computations
3. **Debouncing/Throttling:** Limit frequency of expensive operations
4. **Web Workers:** Offload heavy processing from main thread
5. **Image Optimization:** Compress and resize images appropriately
6. **Virtual Scrolling:** Use for large lists of items

---

## Testing Guidelines

### Testing Philosophy

- **Test Behavior, Not Implementation:** Focus on what the code does, not how
- **Test Coverage:** Aim for >80% coverage on critical paths
- **Fast Tests:** Keep unit tests fast (< 1 second per test file)
- **Isolated Tests:** Tests should not depend on each other
- **Readable Tests:** Tests are documentation; make them clear

### Test Structure

```typescript
describe('ImageProcessor', () => {
  describe('resize', () => {
    it('should resize image to specified dimensions', () => {
      // Arrange
      const originalImage = createMockImage(800, 600);
      const targetSize = { width: 400, height: 300 };

      // Act
      const resizedImage = ImageProcessor.resize(originalImage, targetSize);

      // Assert
      expect(resizedImage.width).toBe(400);
      expect(resizedImage.height).toBe(300);
    });

    it('should maintain aspect ratio when only width is specified', () => {
      const originalImage = createMockImage(800, 600);
      const resizedImage = ImageProcessor.resize(originalImage, { width: 400 });

      expect(resizedImage.width).toBe(400);
      expect(resizedImage.height).toBe(300); // 4:3 ratio maintained
    });

    it('should throw error for invalid dimensions', () => {
      const originalImage = createMockImage(800, 600);

      expect(() => {
        ImageProcessor.resize(originalImage, { width: -100, height: 200 });
      }).toThrow('Invalid dimensions: width and height must be positive');
    });
  });
});
```

### What to Test

**Unit Tests:**
- Utility functions
- Data transformations
- Business logic
- Edge cases and error conditions

**Integration Tests:**
- API endpoints
- Service interactions
- Database operations
- File system operations

**E2E Tests:**
- Critical user workflows
- Multi-step processes
- Cross-browser compatibility

---

## Documentation Practices

### Code Comments

**When to Comment:**
- Complex algorithms or business logic
- Non-obvious workarounds or hacks
- Performance optimizations
- External API integrations

**When NOT to Comment:**
- Self-explanatory code
- Obvious variable/function names
- Redundant information

```typescript
// ❌ Bad: Redundant comment
// Set the user name
const userName = 'John';

// ✅ Good: Explains why, not what
// Use bilinear interpolation for better quality on diagonal lines
const interpolationMethod = 'bilinear';

// ✅ Good: Documents complex algorithm
/**
 * Applies bilateral filter for edge-preserving smoothing.
 * Uses spatial and intensity Gaussian kernels to reduce noise
 * while maintaining sharp edges.
 *
 * Based on Tomasi & Manduchi (1998) algorithm.
 */
function bilateralFilter(image: ImageData, spatialSigma: number, intensitySigma: number): ImageData {
  // Implementation
}
```

### JSDoc/TSDoc

Use for public APIs and exported functions:

```typescript
/**
 * Applies a blur effect to an image using Gaussian kernel.
 *
 * @param image - The source image data
 * @param radius - Blur radius in pixels (1-100)
 * @param options - Optional configuration for blur algorithm
 * @returns Promise that resolves to blurred image data
 * @throws {ImageProcessingError} If image format is unsupported
 *
 * @example
 * ```typescript
 * const blurred = await applyGaussianBlur(imageData, 5);
 * ```
 */
export async function applyGaussianBlur(
  image: ImageData,
  radius: number,
  options?: BlurOptions
): Promise<ImageData> {
  // Implementation
}
```

### README Updates

Update README.md when:
- Adding new features
- Changing installation steps
- Modifying configuration requirements
- Adding new dependencies
- Changing CLI commands or API endpoints

---

## Common Tasks

### Adding a New Feature

1. **Create feature branch:** `git checkout -b claude/feature-name-xxxxx`
2. **Plan the implementation:** Break down into steps
3. **Create necessary files:** Follow directory structure
4. **Implement core logic:** Start with services/business logic
5. **Add UI components:** Build user interface
6. **Add tests:** Write unit and integration tests
7. **Update documentation:** Add to README and CLAUDE.md if needed
8. **Commit and push:** Use conventional commit messages
9. **Create pull request:** Follow PR template

### Fixing a Bug

1. **Reproduce the bug:** Understand the issue completely
2. **Write a failing test:** That demonstrates the bug
3. **Fix the issue:** Make minimal changes to resolve it
4. **Verify the fix:** Ensure test passes and no regressions
5. **Commit:** Use `fix:` prefix in commit message

### Refactoring Code

1. **Ensure tests exist:** For code being refactored
2. **Make incremental changes:** Small, verifiable steps
3. **Run tests frequently:** After each change
4. **Keep commits atomic:** One logical change per commit
5. **Document why:** Explain reason for refactoring in commit message

### Adding Dependencies

1. **Evaluate necessity:** Is this dependency really needed?
2. **Check bundle size:** Will it significantly increase app size?
3. **Check maintenance:** Is it actively maintained?
4. **Check security:** Any known vulnerabilities?
5. **Document usage:** Add to README and relevant docs
6. **Update CLAUDE.md:** Add to tech stack section

---

## Architecture Patterns

### Component Design

**Presentational vs Container Components:**

```typescript
// Presentational Component (dumb component)
// - Receives data via props
// - Focuses on how things look
// - No business logic

interface ImageThumbnailProps {
  src: string;
  alt: string;
  size: number;
  onClick?: () => void;
}

export function ImageThumbnail({ src, alt, size, onClick }: ImageThumbnailProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onClick={onClick}
      className="thumbnail"
    />
  );
}

// Container Component (smart component)
// - Manages state and logic
// - Handles data fetching
// - Passes data to presentational components

export function ImageGalleryContainer() {
  const [images, setImages] = useState<Image[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadImages().then(setImages);
  }, []);

  return (
    <ImageGallery
      images={images}
      selectedImage={selectedImage}
      onImageSelect={setSelectedImage}
    />
  );
}
```

### Service Layer Pattern

```typescript
// services/imageProcessing.service.ts
export class ImageProcessingService {
  /**
   * Applies filters to an image
   */
  async applyFilter(
    imageData: ImageData,
    filter: Filter
  ): Promise<ImageData> {
    // Implementation
  }

  /**
   * Exports image in specified format
   */
  async exportImage(
    imageData: ImageData,
    format: ImageFormat,
    quality?: number
  ): Promise<Blob> {
    // Implementation
  }
}

// Usage in component
const imageService = new ImageProcessingService();
const filtered = await imageService.applyFilter(imageData, selectedFilter);
```

### State Management Patterns

```typescript
// For complex state, use reducer pattern
interface EditorState {
  layers: Layer[];
  activeLayerId: string | null;
  history: EditorState[];
  historyIndex: number;
}

type EditorAction =
  | { type: 'ADD_LAYER'; layer: Layer }
  | { type: 'REMOVE_LAYER'; layerId: string }
  | { type: 'UPDATE_LAYER'; layerId: string; updates: Partial<Layer> }
  | { type: 'SET_ACTIVE_LAYER'; layerId: string }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'ADD_LAYER':
      return {
        ...state,
        layers: [...state.layers, action.layer],
      };
    // Other cases...
    default:
      return state;
  }
}
```

---

## Security Considerations

### Input Validation

Always validate user input, especially for file uploads:

```typescript
// ✅ Good: Validate file type and size
function validateImageUpload(file: File): void {
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Invalid file type. Only PNG, JPEG, and WEBP are allowed.');
  }

  if (file.size > MAX_SIZE) {
    throw new Error('File size exceeds 50MB limit.');
  }
}

// ❌ Bad: No validation
function uploadImage(file: File) {
  return processFile(file);
}
```

### XSS Prevention

```typescript
// ✅ Good: Sanitize user-provided content
import DOMPurify from 'dompurify';

function renderUserContent(htmlContent: string): string {
  return DOMPurify.sanitize(htmlContent);
}

// ❌ Bad: Direct HTML injection
function renderUserContent(htmlContent: string) {
  element.innerHTML = htmlContent; // XSS vulnerability!
}
```

### Sensitive Data

- **Never commit secrets:** API keys, passwords, tokens
- **Use environment variables:** For configuration
- **Client-side security:** Don't store sensitive data in localStorage
- **HTTPS only:** For production deployments

---

## AI Assistant Guidelines

### Critical Rules

1. **Read Before Edit:** ALWAYS read a file before modifying it
2. **Minimal Changes:** Only change what's necessary
3. **Follow Patterns:** Match existing code style and architecture
4. **Test Your Changes:** Verify functionality works as expected
5. **Document Updates:** Keep this CLAUDE.md file current

### Best Practices

1. **Ask When Uncertain:** Use AskUserQuestion tool for clarifications
2. **Break Down Complex Tasks:** Use TodoWrite tool for tracking
3. **Search Before Creating:** Check if functionality already exists
4. **Preserve Existing Functionality:** Don't break working features
5. **Consider Edge Cases:** Think about error conditions and unusual inputs

### Code Quality Checklist

Before committing code, verify:

- [ ] Code follows existing patterns and conventions
- [ ] No hardcoded values (use constants or config)
- [ ] Error handling is appropriate and user-friendly
- [ ] No console.logs or debugging code left in
- [ ] TypeScript types are properly defined
- [ ] Functions have single, clear responsibilities
- [ ] Comments explain "why" for complex logic
- [ ] Tests are added/updated for changes
- [ ] Documentation is updated if needed
- [ ] No security vulnerabilities introduced

### Common Pitfalls to Avoid

1. **Over-engineering:** Don't add features not requested
2. **Premature Optimization:** Focus on correctness first
3. **Breaking Changes:** Maintain backward compatibility
4. **Ignoring Errors:** Always handle potential failures
5. **Inconsistent Style:** Match existing code formatting
6. **Missing Tests:** Don't skip testing for "simple" changes
7. **Large Commits:** Break work into logical, atomic commits

---

## Maintenance

### Keeping CLAUDE.md Updated

This file should be updated when:

- **Tech Stack Changes:** New frameworks, libraries, or tools added
- **Architecture Changes:** New patterns or structural changes
- **Convention Changes:** Updates to coding standards
- **Workflow Changes:** New processes or git workflows
- **Feature Milestones:** Major features that set new patterns
- **Lessons Learned:** Important insights from issues or bugs

### Review Schedule

- Review quarterly for accuracy
- Update after major releases
- Revise when onboarding reveals gaps
- Improve based on AI assistant feedback

---

## Resources

### Useful Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Format code
npm run format

# Build for production
npm run build

# Type check
npm run type-check
```

### Documentation Links

*To be updated as project documentation is created*

- [Contributing Guidelines](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [API Documentation](./docs/API.md)
- [Architecture Documentation](./docs/ARCHITECTURE.md)

---

## Changelog

### 2026-01-18 - Initial Creation
- Created comprehensive CLAUDE.md guide
- Established initial coding standards and conventions
- Defined git workflow and commit message format
- Documented testing guidelines and architecture patterns
- Added security considerations and best practices

---

*This document is maintained by AI assistants working on Vision-Edit-Pro. When in doubt, update this file to improve guidance for future work.*
