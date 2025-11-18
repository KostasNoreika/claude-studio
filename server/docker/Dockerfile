FROM node:20-alpine

# Install essential tools
RUN apk add --no-cache \
    bash \
    git \
    build-base \
    python3 \
    curl \
    jq \
    vim \
    nano

# Install Claude CLI globally as root
RUN npm install -g @anthropic-ai/claude-code

# Configure npm to allow global installs for non-root user
RUN mkdir -p /home/node/.npm && \
    chown -R node:node /home/node/.npm && \
    npm config set prefix /home/node/.npm

# Create bash startup configuration for node user
RUN echo '# .bashrc - bash configuration' > /home/node/.bashrc && \
    echo '' >> /home/node/.bashrc && \
    echo '# Terminal mode configuration for proper backspace/delete behavior' >> /home/node/.bashrc && \
    echo 'if [ -t 0 ]; then' >> /home/node/.bashrc && \
    echo '  stty erase ^? 2>/dev/null || true' >> /home/node/.bashrc && \
    echo '  stty intr ^C 2>/dev/null || true' >> /home/node/.bashrc && \
    echo 'fi' >> /home/node/.bashrc && \
    echo '' >> /home/node/.bashrc && \
    echo '# Terminal colors' >> /home/node/.bashrc && \
    echo 'export TERM=xterm-256color' >> /home/node/.bashrc && \
    echo '' >> /home/node/.bashrc && \
    echo '# Colored prompt with user, host, and working directory' >> /home/node/.bashrc && \
    echo 'export PS1="\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ "' >> /home/node/.bashrc && \
    echo '' >> /home/node/.bashrc && \
    echo '# History settings' >> /home/node/.bashrc && \
    echo 'export HISTSIZE=1000' >> /home/node/.bashrc && \
    echo 'export HISTFILESIZE=2000' >> /home/node/.bashrc && \
    echo 'export HISTCONTROL=ignoredups' >> /home/node/.bashrc && \
    echo '' >> /home/node/.bashrc && \
    echo '# Color support for ls and grep' >> /home/node/.bashrc && \
    echo 'alias ls="ls --color=auto"' >> /home/node/.bashrc && \
    echo 'alias ll="ls -lh"' >> /home/node/.bashrc && \
    echo 'alias la="ls -lha"' >> /home/node/.bashrc && \
    echo 'alias grep="grep --color=auto"' >> /home/node/.bashrc && \
    echo 'alias egrep="egrep --color=auto"' >> /home/node/.bashrc && \
    echo 'alias fgrep="fgrep --color=auto"' >> /home/node/.bashrc && \
    echo '' >> /home/node/.bashrc && \
    echo '# Claude CLI shortcut (c = smart claude with MCP config restore)' >> /home/node/.bashrc && \
    echo 'alias c="~/.claude-manager/bin/smart-selection"' >> /home/node/.bashrc && \
    echo '' >> /home/node/.bashrc && \
    echo '# Enhanced command prompt features' >> /home/node/.bashrc && \
    echo 'shopt -s histappend' >> /home/node/.bashrc && \
    echo 'shopt -s checkwinsize' >> /home/node/.bashrc && \
    chown node:node /home/node/.bashrc && \
    chmod 644 /home/node/.bashrc

# Create .bash_profile to source .bashrc on login
RUN echo '# .bash_profile - Login shell configuration' > /home/node/.bash_profile && \
    echo 'if [ -f ~/.bashrc ]; then' >> /home/node/.bash_profile && \
    echo '    source ~/.bashrc' >> /home/node/.bash_profile && \
    echo 'fi' >> /home/node/.bash_profile && \
    chown node:node /home/node/.bash_profile && \
    chmod 644 /home/node/.bash_profile

# Create workspace directory
WORKDIR /workspace

# Switch to non-root user
USER node

# Add node user's npm bin and Claude CLI to PATH
ENV PATH=/home/node/.npm/bin:/usr/local/lib/node_modules/.bin:$PATH
ENV SHELL=/bin/bash

CMD ["/bin/bash"]
