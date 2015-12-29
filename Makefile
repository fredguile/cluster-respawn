NPM_INSTALL = npm install
NPM_RUN = npm --silent --no-spin run-script

NODE_ENV ?= development
DEBUG ?= cluster-respawn:*
RELOAD ?= false

export NODE_ENV
export DEBUG
export RELOAD

usage:
	@echo ''
	@echo 'Main tasks                       : Description'
	@echo '--------------------             : -----------'
	@echo 'make build                       : Build project'
	@echo 'make lint                        : Lint project'
	@echo 'make test                        : Run tests'
	@echo 'make example                     : Start our usage example'
	@echo ''
	@echo 'Additional tasks                 : Description'
	@echo '--------------------             : -----------'
	@echo 'make reload                      : Reload cluster (when enabled in options)'
	@echo 'make clean                       : Clean up project binaries'

	@echo ''

# ---
# ## Building & Linting
node_modules:
	@$(NPM_INSTALL)

.PHONY: build
build: node_modules clean
	@$(NPM_RUN) build

.PHONY: lint
lint: build
	@$(NPM_RUN) lint

# ---
# ## Testing
.PHONY: test
test:
	@$(NPM_RUN) test

# ---
# ## Demoing
.PHONY: example
example: build
	@$(NPM_RUN) example

# ---
# ## Additional tasks
.PHONY: reload
reload:
	@cat master.pid | xargs kill -SIGUSR2

.PHONY: clean
clean:
	@$(NPM_RUN) clean
