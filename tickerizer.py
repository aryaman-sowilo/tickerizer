import pandas as pd
import os
from fuzzywuzzy import fuzz
from fuzzywuzzy import process
import logging
from bs4 import BeautifulSoup
from io import StringIO
import re
from functools import lru_cache

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

@lru_cache(maxsize=1000)
def clean_company_name(name):
    if pd.isna(name) or not name:
        return None
    
    name = str(name).lower().strip()
    
    # Remove common corporate suffixes and terms
    suffixes = [
        r'\b(?:ltd\.?|limited|inc\.?|incorporated|corp\.?|corporation|llc|plc|pvt\.?|private)\b',
        r'\b(?:co\.?|company|group|holding|holdings|industries|international|global)\b',
        r'\b(?:&|and|amp)\b'
    ]
    
    for suffix in suffixes:
        name = re.sub(suffix, '', name)
    
    # Clean up whitespace and special characters
    name = re.sub(r'[^\w\s]', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    
    return name.strip()

@lru_cache(maxsize=500)
def find_ticker(company_name, ticker_dict_tuple):
    # Convert tuple back to dict for processing
    ticker_dict = dict(ticker_dict_tuple)
    
    if pd.isna(company_name) or company_name.strip() == '' or 'Cash' in company_name or 'Equity' in company_name:
        print(f"SKIPPING: {company_name} (empty/cash/equity)")
        return ''
    
    clean_name = clean_company_name(company_name)
    if not clean_name or len(clean_name) <= 2:
        print(f"SKIPPING: {company_name} (too short after cleaning)")
        return ''
    
    print(f"SEARCHING: {company_name} -> cleaned: {clean_name}")
    
    input_words = clean_name.split()
    
    # Strategy 1: Exact match (fastest)
    for key in ticker_dict.keys():
        if clean_company_name(key) == clean_name:
            print(f"EXACT MATCH: {company_name} -> {ticker_dict[key]}")
            return ticker_dict[key]
    
    # Strategy 1.5: Check for direct acronym match as separate word or at start
    if len(input_words) == 1 and len(clean_name) >= 3:
        for key in ticker_dict.keys():
            # Check if input matches as a standalone word or at the beginning of company name
            key_upper = key.upper()
            input_upper = clean_name.upper()
            if (f" {input_upper} " in f" {key_upper} ") or key_upper.startswith(f"{input_upper} "):
                print(f"DIRECT NAME MATCH: {company_name} -> {ticker_dict[key]}")
                return ticker_dict[key]
    
    # Strategy 2: Enhanced fuzzy matching with better abbreviation handling
    best_match = None
    best_score = 0
    min_threshold = 70  # Raise threshold to prevent poor matches
    
    for key in ticker_dict.keys():
        clean_key = clean_company_name(key)
        if not clean_key:
            continue
            
        key_words = clean_key.split()
        
        
        # Calculate multiple scoring metrics
        base_score = fuzz.token_sort_ratio(clean_name, clean_key)
        partial_score = fuzz.partial_ratio(clean_name, clean_key)
        token_set_score = fuzz.token_set_ratio(clean_name, clean_key)
        
        # Prevent very short names from getting high partial scores (avoid "ser" matching "services")
        if len(clean_key) <= 4 and partial_score > 80:
            partial_score = min(partial_score, 60)
        
        # Start with the highest base score
        score = max(base_score, partial_score, token_set_score)
        
        # Word-level matching for abbreviations
        matched_words = 0
        significant_matches = 0  # Track matches of important words
        total_input_words = len(input_words)
        
        for input_word in input_words:
            word_matched = False
            # Check for exact word matches
            if input_word in key_words:
                matched_words += 1
                word_matched = True
                # Give more weight to longer, more significant words
                if len(input_word) > 3:
                    significant_matches += 1
            else:
                # Check for abbreviation matches (first few chars)
                for key_word in key_words:
                    if len(input_word) >= 3 and key_word.startswith(input_word):
                        matched_words += 1
                        word_matched = True
                        if len(input_word) > 3:
                            significant_matches += 1
                        break
                    elif len(key_word) >= 3 and input_word.startswith(key_word):
                        matched_words += 1
                        word_matched = True
                        break
        
        # Calculate word match percentage
        word_match_ratio = matched_words / total_input_words if total_input_words > 0 else 0
        significant_match_ratio = significant_matches / max(1, len([w for w in input_words if len(w) > 3]))
        
        # Boost score based on word matches - prioritize significant word matches
        if word_match_ratio >= 0.8 and significant_match_ratio >= 0.5:  # High quality matches
            score += 40
        elif word_match_ratio >= 0.7:  # At least 70% of words match
            score += 30
        elif word_match_ratio >= 0.5:  # At least 50% of words match
            score += 15
        
        # Penalty for poor word matching when we have multiple words
        if total_input_words >= 2 and word_match_ratio < 0.3:
            score -= 25
        
        # Penalty for very different lengths (prevents "Apar" matching "Esaar")
        len_diff = abs(len(clean_name) - len(clean_key))
        if len_diff > 10:
            score -= min(20, len_diff)
        
        # Additional validation: check if first word matches reasonably
        if input_words and key_words:
            first_word_score = fuzz.ratio(input_words[0], key_words[0])
            if first_word_score < 60:  # First word should have decent similarity
                score -= 20
            elif first_word_score >= 90:  # Strong first word match gets bonus
                score += 10
        
        # Strong boost for company name prefix matches (e.g., "BLS" should strongly prefer "BLS International")
        if input_words and key_words:
            if input_words[0] == key_words[0]:  # Exact first word match
                score += 25
            elif len(input_words[0]) >= 3 and key_words[0].startswith(input_words[0]):
                score += 20
            elif len(key_words[0]) >= 3 and input_words[0].startswith(key_words[0]):
                score += 15
        
        # Acronym matching: Check if input could be an acronym of the key
        if len(key_words) >= 2:
            # Generate acronym from key words (skip short words)
            acronym = ''.join([word[0].upper() for word in key_words if len(word) > 2])
            
            # Check single word input (e.g., "CAMS")
            if len(input_words) == 1 and len(input_words[0]) >= 3:
                input_word = input_words[0].upper()
                if input_word == acronym:
                    score += 50  # Strong boost for acronym matches
                    # Ensure perfect acronym matches get a very high minimum score
                    score = max(score, 95)
                elif input_word in acronym or acronym.startswith(input_word):
                    score += 30  # Partial acronym match
                else:
                    # Penalize matches that don't match the acronym when input is short and likely an acronym
                    if len(input_word) >= 3 and len(input_word) <= 5:
                        score -= 15  # Penalty for non-acronym matches when input looks like acronym
            
            # Check first word of multi-word input (e.g., "Cams Services")
            elif len(input_words) >= 2 and len(input_words[0]) >= 3:
                first_word = input_words[0].upper()
                if first_word == acronym:
                    score += 45  # Strong boost for first word being an acronym
                elif first_word in acronym or acronym.startswith(first_word):
                    score += 25  # Partial acronym match for first word
        
        if score > best_score and score >= min_threshold:
            best_score = score
            best_match = key
    
    if best_match:
        print(f"FUZZY MATCH: {company_name} -> {ticker_dict[best_match]} (score: {best_score})")
        return ticker_dict[best_match]
    else:
        print(f"NO MATCH: {company_name}")
        return ''

def process_html_file(input_file):
    # Read HTML file
    with open(input_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Parse HTML using BeautifulSoup
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Extract table data
    table = soup.find('table')
    if not table:
        raise ValueError("No table found in HTML file")
        
    # Get headers and rows
    headers = []
    header_row = table.find('tr')
    for th in header_row.find_all('td'):
        header = th.get_text().strip()
        header = header.split('\n')[0]
        headers.append(header)
        
    # Get data rows
    rows = []
    for tr in table.find_all('tr')[1:]:
        row = []
        for td in tr.find_all('td'):
            export_name = td.find('span', class_='exportName')
            if export_name:
                row.append(export_name.get_text().strip())
            else:
                row.append(td.get_text().strip())
        rows.append(row)
        
    return pd.DataFrame(rows, columns=headers)

def process_portfolio_csv(file_path):
    # Read all lines from the file
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Find the start of the equity section
    start_idx = -1
    for i, line in enumerate(lines):
        if 'Security,Quantity' in line or 'Stock Name,BSE Code' in line:
            start_idx = i
            break
    
    if start_idx == -1:
        raise ValueError("Could not find equity section in portfolio file")
    
    # Find the end of the equity section (usually marked by Cash and Equivalent)
    end_idx = -1
    for i in range(start_idx + 1, len(lines)):
        if 'Cash and Equivalent' in lines[i]:
            end_idx = i
            break
    
    if end_idx == -1:
        end_idx = len(lines)  # If no Cash section found, read till end
    
    # Create a new CSV string with just the equity section
    equity_csv = ''.join(lines[start_idx:end_idx])
    
    # Read the CSV data
    df = pd.read_csv(StringIO(equity_csv))
    
    # If we have a Security column, rename it to Stock Name
    if 'Security' in df.columns:
        # Clean up the Security column to remove any empty rows or summary rows
        df = df[df['Security'].notna()]
        df = df[~df['Security'].str.contains('Equity', na=False)]
        df = df.rename(columns={'Security': 'Stock Name'})
    elif 'Name' in df.columns:
        df = df.rename(columns={'Name': 'Stock Name'})
    
    return df

def process_file(input_file, ticker_dict):
    file_ext = os.path.splitext(input_file)[1].lower()
    
    # Read file based on extension
    if file_ext in ['.xls', '.html']:
        df = process_html_file(input_file)
    elif file_ext == '.xlsx':
        df = pd.read_excel(input_file)
    elif file_ext == '.csv':
        try:
            # First try to read as a portfolio file
            df = process_portfolio_csv(input_file)
        except Exception as e:
            logging.info(f"Not a portfolio file, trying normal CSV reading: {str(e)}")
            # If that fails, try normal CSV reading
            df = pd.read_csv(input_file)
            # Check if we have a Name column instead of Stock Name
            if 'Name' in df.columns and 'Stock Name' not in df.columns:
                df = df.rename(columns={'Name': 'Stock Name'})
    else:
        raise ValueError(f"Unsupported file format: {file_ext}")
    
    # Convert dict to tuple for caching
    ticker_dict_tuple = tuple(ticker_dict.items())
    
    # Add Tickers column as first column
    tickers = df['Stock Name'].apply(lambda x: find_ticker(x, ticker_dict_tuple))
    df.insert(0, 'Tickers', tickers)
    
    return df

def process_file_line_by_line(input_file, ticker_dict):
    # Convert dict to tuple for caching
    ticker_dict_tuple = tuple(ticker_dict.items())
    
    # Read the input file line by line
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Process the file and add tickers
    output_lines = []
    for line in lines:
        if ',' not in line or line.strip() == '':
            # Keep header lines and empty lines as is, just add a blank ticker column
            output_lines.append(',' + line)
            continue
            
        parts = line.strip().split(',')
        company_name = parts[0]
        
        # Find ticker for the company
        ticker = find_ticker(company_name, ticker_dict_tuple)
        
        # Add ticker as first column
        output_lines.append(ticker + ',' + line)

    return output_lines

def add_tickers_to_stocks():
    try:
        # Create input and output directories if they don't exist
        os.makedirs('input', exist_ok=True)
        os.makedirs('output', exist_ok=True)
        
        # Read parent file with tickers
        logging.info("Reading ticker reference file...")
        parent_df = pd.read_csv('static/Stock Tickers.csv')
        
        # Create dictionary for faster lookup
        ticker_dict = {}
        for _, row in parent_df.iterrows():
            bloom_ticker = row['Bloom Ticker']
            if pd.notna(row['Default']):
                ticker_dict[row['Default'].lower()] = bloom_ticker
        
        # Process all supported files in input directory
        supported_extensions = ['.xls', '.xlsx', '.csv', '.html']
        input_files = [f for f in os.listdir('input') 
                      if os.path.splitext(f)[1].lower() in supported_extensions]
        
        for input_file in input_files:
            logging.info(f"Processing {input_file}...")
            input_path = os.path.join('input', input_file)
            
            try:
                # For CSV files, process line by line to preserve structure
                if input_file.endswith('.csv'):
                    output_lines = process_file_line_by_line(input_path, ticker_dict)
                    output_name = os.path.splitext(input_file)[0] + '_with_tickers.csv'
                    output_path = os.path.join('output', output_name)
                    with open(output_path, 'w', encoding='utf-8', newline='') as f:
                        f.writelines(output_lines)
                else:
                    # For other file types, process using pandas
                    df = process_file(input_path, ticker_dict)
                    output_name = os.path.splitext(input_file)[0] + '_with_tickers.xlsx'
                    output_path = os.path.join('output', output_name)
                    df.to_excel(output_path, index=False)
                
                logging.info(f"Saved processed file to {output_path}")
            except Exception as e:
                logging.error(f"Failed to process {input_file}: {str(e)}")
                continue
            
    except Exception as e:
        logging.error(f"Script failed: {str(e)}")
        raise

if __name__ == "__main__":
    add_tickers_to_stocks()