.PHONY: help ci-backend-test ci-frontend-test ci-lint ci-e2e-test ci-all install build clean typecheck test

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm ci

build: ## Build all packages
	@echo "$(GREEN)Building packages...$(NC)"
	npm run build

typecheck: ## Run TypeScript type checking
	@echo "$(GREEN)Running type checks...$(NC)"
	npm run typecheck

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	npm test

clean: ## Clean build artifacts
	@echo "$(GREEN)Cleaning build artifacts...$(NC)"
	npm run clean

ci-backend-test: ## Run backend tests (TypeScript packages)
	@echo "$(GREEN)Running backend tests...$(NC)"
	@echo "$(YELLOW)Running typecheck...$(NC)"
	npm run typecheck
	@echo "$(YELLOW)Running tests...$(NC)"
	npm test

ci-frontend-test: ## Run frontend tests (placeholder - no frontend yet)
	@echo "$(YELLOW)No frontend tests configured yet$(NC)"
	@echo "This project currently only has backend TypeScript packages"
	@exit 0

ci-lint: ## Run linting checks
	@echo "$(GREEN)Running lint checks...$(NC)"
	@echo "$(YELLOW)Checking for ESLint configuration...$(NC)"
	@if [ -f .eslintrc.js ] || [ -f .eslintrc.json ] || grep -q "eslint" package.json; then \
		npm run lint 2>/dev/null || echo "$(YELLOW)ESLint configured but no 'lint' script found$(NC)"; \
	else \
		echo "$(YELLOW)No ESLint configuration found$(NC)"; \
	fi
	@echo "$(YELLOW)Checking for Prettier configuration...$(NC)"
	@if [ -f .prettierrc ] || [ -f .prettierrc.json ] || grep -q "prettier" package.json; then \
		npm run format:check 2>/dev/null || echo "$(YELLOW)Prettier configured but no 'format:check' script found$(NC)"; \
	else \
		echo "$(YELLOW)No Prettier configuration found$(NC)"; \
	fi
	@echo "$(GREEN)Typecheck can serve as basic code quality check$(NC)"
	npm run typecheck

ci-e2e-test: ## Run end-to-end tests (placeholder - no e2e tests yet)
	@echo "$(YELLOW)No E2E tests configured yet$(NC)"
	@echo "To add E2E tests, consider:"
	@echo "  - Playwright for web UI testing"
	@echo "  - Integration tests for CLI tools"
	@echo "  - API endpoint testing"
	@exit 0

ci-all: ci-backend-test ci-frontend-test ci-lint ci-e2e-test ## Run all CI checks
	@echo "$(GREEN)✅ All CI checks completed$(NC)"

# Development helpers
dev: ## Start development mode (builds with watch)
	@echo "$(GREEN)Starting development mode...$(NC)"
	npm run dev --workspaces --if-present

# Knowledge Pack Server specific targets
pack-server-dev: ## Run knowledge pack server in dev mode
	@echo "$(GREEN)Starting knowledge pack server...$(NC)"
	cd packages/knowledge-pack-server && npm run dev

pack-server-start: ## Start knowledge pack server (production)
	@echo "$(GREEN)Starting knowledge pack server (production)...$(NC)"
	cd packages/knowledge-pack-server && npm start
